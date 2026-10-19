import { supabase } from "../lib/supabase";
import { fetchUserScopedHierarchy } from "../lib/userScope";
import type { Automation, Scene } from "../types/automations";

let processingCommands = false;
const lastTriggeredMinuteByAutoId = new Map<string, string>();
const lastObservedDeviceStates = new Map<string, string>();

const PHYSICAL_DEVICES_STORAGE_KEY = "oduzz_physical_device_ids";

export function isVirtualHubEnabled(): boolean {
  try {
    return localStorage.getItem("oduzz_virtual_hub_enabled") !== "false";
  } catch {
    return true;
  }
}

export function setVirtualHubEnabled(enabled: boolean): void {
  try {
    localStorage.setItem("oduzz_virtual_hub_enabled", enabled ? "true" : "false");
    window.dispatchEvent(new Event("oduzz-hub-mode-change"));
  } catch (err) {
    console.error("Failed to save virtual hub preference:", err);
  }
}

export function getStoredPhysicalDeviceIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PHYSICAL_DEVICES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    }
  } catch {
    // ignore
  }
  return new Set();
}

export function isPhysicalHardwareUid(uid?: string): boolean {
  if (!uid) return false;
  const upper = uid.trim().toUpperCase();
  return (
    upper.startsWith("ESP32") ||
    upper.startsWith("HW-") ||
    upper.startsWith("PHYSICAL") ||
    upper.startsWith("NODE-")
  );
}

export function isDevicePhysical(device: {
  id: string;
  device_uid?: string;
}): boolean {
  if (isPhysicalHardwareUid(device.device_uid)) {
    return true;
  }
  return getStoredPhysicalDeviceIds().has(device.id);
}

export function setDevicePhysicalMode(deviceId: string, isPhysical: boolean): void {
  try {
    const set = getStoredPhysicalDeviceIds();
    if (isPhysical) {
      set.add(deviceId);
    } else {
      set.delete(deviceId);
    }
    localStorage.setItem(PHYSICAL_DEVICES_STORAGE_KEY, JSON.stringify([...set]));
    window.dispatchEvent(new Event("oduzz-hub-mode-change"));
  } catch (err) {
    console.error("Failed to save device physical mode:", err);
  }
}

/**
 * Evaluates user-configured Automations (TIME and DEVICE_STATE triggers)
 * persisted in localStorage and dispatches their target Scene commands.
 */
async function evaluateAutomations(
  userId: string,
  userDevices: { id: string; device_type: string; device_uid?: string }[]
) {
  if (userDevices.length === 0) return;
  const userDeviceIds = userDevices.map((d) => d.id);

  try {
    const rawAutos =
      localStorage.getItem(`oduzz_automations_${userId}`) ||
      localStorage.getItem("oduzz_automations");
    const rawScenes =
      localStorage.getItem(`oduzz_scenes_${userId}`) ||
      localStorage.getItem("oduzz_scenes");
    if (!rawAutos || !rawScenes) return;

    const automations: Automation[] = JSON.parse(rawAutos);
    const scenes: Scene[] = JSON.parse(rawScenes);
    const enabledAutos = automations.filter((a) => a.enabled);
    if (enabledAutos.length === 0) return;

    const now = new Date();
    const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    // Fetch current states for user devices if any DEVICE_STATE trigger is active
    const hasStateTriggers = enabledAutos.some(
      (a) => a.trigger.type === "DEVICE_STATE"
    );
    const currentStateMap = new Map<string, string>();

    if (hasStateTriggers) {
      const { data: states } = await supabase
        .from("device_states")
        .select("device_id, actual_state")
        .in("device_id", userDeviceIds);

      for (const s of states ?? []) {
        currentStateMap.set(s.device_id, s.actual_state);
      }
    }

    for (const auto of enabledAutos) {
      let shouldTrigger = false;

      if (auto.trigger.type === "TIME") {
        if (
          auto.trigger.time === currentHHMM &&
          lastTriggeredMinuteByAutoId.get(auto.id) !== currentHHMM
        ) {
          lastTriggeredMinuteByAutoId.set(auto.id, currentHHMM);
          shouldTrigger = true;
        }
      } else if (auto.trigger.type === "DEVICE_STATE") {
        const { deviceId, expectedState } = auto.trigger;
        const currentActual = currentStateMap.get(deviceId);
        const prevKey = `${auto.id}:${deviceId}`;
        const previousActual = lastObservedDeviceStates.get(prevKey);

        if (currentActual) {
          lastObservedDeviceStates.set(prevKey, currentActual);
          if (
            previousActual !== undefined &&
            previousActual !== currentActual &&
            currentActual === expectedState
          ) {
            shouldTrigger = true;
          }
        }
      }

      if (shouldTrigger) {
        const scene = scenes.find((s) => s.id === auto.sceneId);
        if (!scene) continue;

        const commandRows = buildSceneCommandRows(scene, userDevices);
        if (commandRows.length > 0) {
          await supabase.from("device_commands").insert(commandRows);
        }
      }
    }
  } catch (err) {
    console.warn("Automation evaluation warning:", err);
  }
}

export function buildSceneCommandRows(
  scene: Scene,
  devices: { id: string; device_type: string }[]
): { device_id: string; command: "TURN_ON" | "TURN_OFF"; status: "pending" }[] {
  const validDeviceIds = new Set(devices.map((d) => d.id));

  if (scene.actions && scene.actions.length > 0) {
    return scene.actions
      .filter((act) => validDeviceIds.has(act.deviceId))
      .map((act) => ({
        device_id: act.deviceId,
        command: act.command,
        status: "pending" as const,
      }));
  }

  const lowerName = scene.name.toLowerCase();
  if (lowerName.includes("movie")) {
    return devices.map((d) => ({
      device_id: d.id,
      command: d.device_type === "light" ? "TURN_OFF" : "TURN_ON",
      status: "pending" as const,
    }));
  }

  if (lowerName.includes("night") || lowerName.includes("away")) {
    return devices.map((d) => ({
      device_id: d.id,
      command: "TURN_OFF" as const,
      status: "pending" as const,
    }));
  }

  return devices.map((d) => ({
    device_id: d.id,
    command: "TURN_ON" as const,
    status: "pending" as const,
  }));
}

export async function processPendingCommands(_options?: { immediate?: boolean }) {
  // Prevent two Virtual Hub processes from running at the same time
  if (processingCommands) {
    return;
  }

  processingCommands = true;

  try {
    // Scope strictly to the logged-in user's devices so we never steal other tenants' commands
    const { userId, devices } = await fetchUserScopedHierarchy();
    if (!userId || devices.length === 0) {
      return;
    }

    // Evaluate scheduled/state automations in the background even if all devices are physical
    await evaluateAutomations(userId, devices);

    // If Virtual Hub simulator is disabled, leave all command execution to physical ESP32 nodes
    if (!isVirtualHubEnabled()) {
      return;
    }

    // Only simulate commands for devices that are NOT configured as physical ESP32 hardware
    const virtualDeviceIds = devices
      .filter((d) => !isDevicePhysical(d))
      .map((d) => d.id);

    if (virtualDeviceIds.length === 0) {
      return;
    }

    const { data: commands, error } = await supabase
      .from("device_commands")
      .select("*")
      .eq("status", "pending")
      .in("device_id", virtualDeviceIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading commands:", error);
      return;
    }

    if (!commands || commands.length === 0) {
      return;
    }

    for (const command of commands) {
      let desiredState: string;

      if (command.command === "TURN_ON") {
        desiredState = "ON";
      } else if (command.command === "TURN_OFF") {
        desiredState = "OFF";
      } else {
        console.error(`Virtual Hub: Unknown command ${command.command}`);
        continue;
      }

      // 1. Claim the command atomically
      const { data: claimedCommand, error: claimError } = await supabase
        .from("device_commands")
        .update({
          status: "processing",
        })
        .eq("id", command.id)
        .eq("status", "pending")
        .select()
        .maybeSingle();

      if (claimError || !claimedCommand) {
        continue;
      }

      // 2. Update desired state
      const { error: desiredStateError } = await supabase
        .from("device_states")
        .update({
          desired_state: desiredState,
          updated_at: new Date().toISOString(),
        })
        .eq("device_id", command.device_id);

      if (desiredStateError) {
        await supabase
          .from("device_commands")
          .update({ status: "failed" })
          .eq("id", command.id);
        continue;
      }

      // 3. Simulate physical device response latency
      await new Promise((resolve) => setTimeout(resolve, 350));

      // 4. Update actual state
      const { error: actualStateError } = await supabase
        .from("device_states")
        .update({
          actual_state: desiredState,
          updated_at: new Date().toISOString(),
        })
        .eq("device_id", command.device_id);

      if (actualStateError) {
        await supabase
          .from("device_commands")
          .update({ status: "failed" })
          .eq("id", command.id);
        continue;
      }

      // 5. Record activity
      const { error: activityError } = await supabase
        .from("device_activity")
        .insert({
          device_id: command.device_id,
          command: command.command,
          result: "success",
        });

      if (activityError) {
        await supabase
          .from("device_commands")
          .update({ status: "failed" })
          .eq("id", command.id);
        continue;
      }

      // 6. Mark command completed
      await supabase
        .from("device_commands")
        .update({
          status: "completed",
          executed_at: new Date().toISOString(),
        })
        .eq("id", command.id)
        .eq("status", "processing");
    }
  } finally {
    processingCommands = false;
  }
}

let hubRunning = false;

export function startVirtualHub() {
  if (hubRunning) {
    return;
  }

  hubRunning = true;

  // Run initial check
  processPendingCommands();

  const interval = setInterval(() => {
    processPendingCommands();
  }, 2000);

  return () => {
    clearInterval(interval);
    hubRunning = false;
    processingCommands = false;
  };
}