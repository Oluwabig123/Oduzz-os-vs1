import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { fetchUserScopedHierarchy } from "../../lib/userScope";
import { buildSceneCommandRows, processPendingCommands } from "../../hub/virtualHub";
import type { Scene, SceneAction, Automation } from "../../types/automations";
import "./Automations.css";

type Device = {
  id: string;
  name: string;
  device_type: string;
};

const SCENES_STORAGE_KEY = "oduzz_scenes";
const AUTOMATIONS_STORAGE_KEY = "oduzz_automations";

const DEFAULT_SCENES: Scene[] = [
  {
    id: "scene-movie",
    homeId: "default",
    name: "Movie Mode 🎬",
    description: "Turns off room lights and activates media & climate devices",
    actions: [],
  },
  {
    id: "scene-night",
    homeId: "default",
    name: "Night Mode 🌙",
    description: "Turns off all home appliances for bedtime",
    actions: [],
  },
  {
    id: "scene-welcome",
    homeId: "default",
    name: "Welcome Home 🏠",
    description: "Turns on main living room lights and climate control",
    actions: [],
  },
];

const DEFAULT_AUTOMATIONS: Automation[] = [
  {
    id: "auto-evening",
    name: "Evening Ambient Lighting",
    trigger: { type: "TIME", time: "19:00" },
    sceneId: "scene-welcome",
    enabled: true,
  },
  {
    id: "auto-night",
    name: "Auto Night Mode Lock",
    trigger: { type: "TIME", time: "23:00" },
    sceneId: "scene-night",
    enabled: true,
  },
];

function AutomationsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Scene Form state (supports multiple device actions per scene)
  const [showSceneForm, setShowSceneForm] = useState(false);
  const [sceneName, setSceneName] = useState("");
  const [sceneDesc, setSceneDesc] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [sceneCommand, setSceneCommand] = useState<"TURN_ON" | "TURN_OFF">("TURN_ON");
  const [draftActions, setDraftActions] = useState<SceneAction[]>([]);

  // Automation Form state
  const [showAutoForm, setShowAutoForm] = useState(false);
  const [autoName, setAutoName] = useState("");
  const [triggerType, setTriggerType] = useState<"TIME" | "DEVICE_STATE">("TIME");
  const [triggerTime, setTriggerTime] = useState("19:00");
  const [triggerDeviceId, setTriggerDeviceId] = useState("");
  const [triggerState, setTriggerState] = useState<"ON" | "OFF">("ON");
  const [targetSceneId, setTargetSceneId] = useState("scene-welcome");

  const [executing, setExecuting] = useState<string | null>(null);

  useEffect(() => {
    initializePage();
  }, []);

  function showNotice(msg: string) {
    setBannerMessage(msg);
    setTimeout(() => {
      setBannerMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  }

  async function initializePage() {
    const { userId: uid, devices: userDevices } = await fetchUserScopedHierarchy();
    setUserId(uid);

    const mapped = userDevices.map((d) => ({
      id: d.id,
      name: d.name,
      device_type: d.device_type,
    }));
    setDevices(mapped);
    if (mapped.length > 0) {
      setSelectedDeviceId(mapped[0].id);
      setTriggerDeviceId(mapped[0].id);
    }

    loadInitialData(uid);
  }

  function loadInitialData(uid: string | null) {
    let initialScenes = DEFAULT_SCENES;
    let initialAutomations = DEFAULT_AUTOMATIONS;

    const userSceneKey = uid ? `${SCENES_STORAGE_KEY}_${uid}` : SCENES_STORAGE_KEY;
    const userAutoKey = uid
      ? `${AUTOMATIONS_STORAGE_KEY}_${uid}`
      : AUTOMATIONS_STORAGE_KEY;

    try {
      const savedScenes =
        localStorage.getItem(userSceneKey) ||
        localStorage.getItem(SCENES_STORAGE_KEY);
      if (savedScenes) {
        const parsed = JSON.parse(savedScenes);
        if (Array.isArray(parsed) && parsed.length > 0) {
          initialScenes = parsed;
        }
      } else {
        localStorage.setItem(userSceneKey, JSON.stringify(DEFAULT_SCENES));
        localStorage.setItem(SCENES_STORAGE_KEY, JSON.stringify(DEFAULT_SCENES));
      }

      const savedAutos =
        localStorage.getItem(userAutoKey) ||
        localStorage.getItem(AUTOMATIONS_STORAGE_KEY);
      if (savedAutos) {
        const parsed = JSON.parse(savedAutos);
        if (Array.isArray(parsed) && parsed.length > 0) {
          initialAutomations = parsed;
        }
      } else {
        localStorage.setItem(userAutoKey, JSON.stringify(DEFAULT_AUTOMATIONS));
        localStorage.setItem(
          AUTOMATIONS_STORAGE_KEY,
          JSON.stringify(DEFAULT_AUTOMATIONS)
        );
      }
    } catch (err) {
      console.warn("Failed to load scenes/automations from storage:", err);
    }

    setScenes(initialScenes);
    setAutomations(initialAutomations);
    if (initialScenes.length > 0) {
      setTargetSceneId(initialScenes[0].id);
    }
  }

  function persistScenes(nextScenes: Scene[]) {
    setScenes(nextScenes);
    try {
      if (userId) {
        localStorage.setItem(
          `${SCENES_STORAGE_KEY}_${userId}`,
          JSON.stringify(nextScenes)
        );
      }
      localStorage.setItem(SCENES_STORAGE_KEY, JSON.stringify(nextScenes));
    } catch (err) {
      console.error("Failed to save scenes:", err);
    }
  }

  function persistAutomations(nextAutos: Automation[]) {
    setAutomations(nextAutos);
    try {
      if (userId) {
        localStorage.setItem(
          `${AUTOMATIONS_STORAGE_KEY}_${userId}`,
          JSON.stringify(nextAutos)
        );
      }
      localStorage.setItem(AUTOMATIONS_STORAGE_KEY, JSON.stringify(nextAutos));
    } catch (err) {
      console.error("Failed to save automations:", err);
    }
  }

  async function triggerScene(scene: Scene) {
    if (devices.length === 0) {
      showNotice("Add at least one device in the Devices page to execute scenes.");
      return;
    }

    setExecuting(scene.id);

    const commandRows = buildSceneCommandRows(scene, devices);
    if (commandRows.length > 0) {
      await supabase.from("device_commands").insert(commandRows);
      await processPendingCommands({ immediate: true });
    }

    setTimeout(() => {
      setExecuting(null);
      showNotice(
        `Activated "${scene.name}" — dispatched ${commandRows.length} device command(s).`
      );
    }, 450);
  }

  function addDraftAction() {
    if (!selectedDeviceId) return;
    setDraftActions((prev) => {
      const filtered = prev.filter((a) => a.deviceId !== selectedDeviceId);
      return [...filtered, { deviceId: selectedDeviceId, command: sceneCommand }];
    });
  }

  function removeDraftAction(deviceId: string) {
    setDraftActions((prev) => prev.filter((a) => a.deviceId !== deviceId));
  }

  function createScene() {
    if (!sceneName.trim()) {
      showNotice("Please enter a scene name.");
      return;
    }

    const actionsToSave: SceneAction[] =
      draftActions.length > 0
        ? draftActions
        : selectedDeviceId
        ? [{ deviceId: selectedDeviceId, command: sceneCommand }]
        : [];

    const newScene: Scene = {
      id: `scene-${Date.now()}`,
      homeId: "default",
      name: sceneName.trim(),
      description: sceneDesc.trim() || "Custom multi-device scene preset",
      actions: actionsToSave,
    };

    const nextScenes = [newScene, ...scenes];
    persistScenes(nextScenes);
    if (!targetSceneId) {
      setTargetSceneId(newScene.id);
    }
    setSceneName("");
    setSceneDesc("");
    setDraftActions([]);
    setShowSceneForm(false);
    showNotice(`Scene "${newScene.name}" created.`);
  }

  function deleteScene(sceneId: string) {
    const nextScenes = scenes.filter((s) => s.id !== sceneId);
    persistScenes(nextScenes);
    showNotice("Scene removed.");
  }

  function createAutomation() {
    if (!autoName.trim()) {
      showNotice("Please enter an automation name.");
      return;
    }

    const newAuto: Automation = {
      id: `auto-${Date.now()}`,
      name: autoName.trim(),
      trigger:
        triggerType === "TIME"
          ? { type: "TIME", time: triggerTime }
          : {
              type: "DEVICE_STATE",
              deviceId: triggerDeviceId,
              expectedState: triggerState,
            },
      sceneId: targetSceneId || scenes[0]?.id,
      enabled: true,
    };

    persistAutomations([newAuto, ...automations]);
    setAutoName("");
    setShowAutoForm(false);
    showNotice(`Automation "${newAuto.name}" saved and enabled.`);
  }

  function toggleAutomation(id: string) {
    persistAutomations(
      automations.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
  }

  function deleteAutomation(id: string) {
    persistAutomations(automations.filter((a) => a.id !== id));
    showNotice("Automation rule deleted.");
  }

  return (
    <div className="automations-page">
      <div className="automations-header">
        <div>
          <h1>Automations & Scenes</h1>
          <p>Configure smart triggers, preset scenes, and automated routines</p>
        </div>
      </div>

      {bannerMessage && (
        <div
          style={{
            marginBottom: "20px",
            padding: "12px 16px",
            borderRadius: "12px",
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            color: "#1e3a8a",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>⚡ {bannerMessage}</span>
          <button
            onClick={() => setBannerMessage(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#1e3a8a",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Preset Scenes Section */}
      <section className="automations-section">
        <div className="section-title-bar">
          <div>
            <h2>Preset Scenes 🎬</h2>
            <p>One-tap multi-device action routines (also voice-activated)</p>
          </div>
          <button
            className="add-btn"
            onClick={() => setShowSceneForm(!showSceneForm)}
          >
            {showSceneForm ? "Cancel" : "+ Create Scene"}
          </button>
        </div>

        {showSceneForm && (
          <div className="form-card">
            <h3>New Scene Configuration</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Scene Name</label>
                <input
                  type="text"
                  placeholder="e.g. Party Mode 🎉"
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  placeholder="e.g. Turns on living room lights and AC"
                  value={sceneDesc}
                  onChange={(e) => setSceneDesc(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Select Device</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                >
                  {devices.length === 0 ? (
                    <option value="">No devices available</option>
                  ) : (
                    devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>Target State</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <select
                    style={{ flex: 1 }}
                    value={sceneCommand}
                    onChange={(e) =>
                      setSceneCommand(e.target.value as "TURN_ON" | "TURN_OFF")
                    }
                  >
                    <option value="TURN_ON">Turn ON 🟢</option>
                    <option value="TURN_OFF">Turn OFF ⚫</option>
                  </select>
                  <button
                    type="button"
                    onClick={addDraftAction}
                    disabled={!selectedDeviceId}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      fontWeight: 700,
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    + Add Action
                  </button>
                </div>
              </div>
            </div>

            {draftActions.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginBottom: "14px",
                }}
              >
                {draftActions.map((act) => {
                  const dev = devices.find((d) => d.id === act.deviceId);
                  return (
                    <span
                      key={act.deviceId}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        background: "#eef2ff",
                        color: "#315efb",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      {dev?.name || "Device"} → {act.command === "TURN_ON" ? "ON" : "OFF"}
                      <button
                        type="button"
                        onClick={() => removeDraftAction(act.deviceId)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <button className="save-btn" onClick={createScene}>
              Save Scene
            </button>
          </div>
        )}

        <div className="scenes-grid">
          {scenes.map((scene) => {
            const isDefault = scene.id.startsWith("scene-movie") ||
              scene.id.startsWith("scene-night") ||
              scene.id.startsWith("scene-welcome");

            return (
              <div className="scene-card" key={scene.id}>
                <div>
                  <div className="scene-card-header">
                    <h3>{scene.name}</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="scene-badge">
                        {scene.actions.length > 0
                          ? `${scene.actions.length} Action${scene.actions.length > 1 ? "s" : ""}`
                          : "Smart Preset"}
                      </span>
                      {!isDefault && (
                        <button
                          onClick={() => deleteScene(scene.id)}
                          title="Delete Scene"
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#94a3b8",
                            cursor: "pointer",
                            fontSize: "13px",
                          }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                  <p>{scene.description}</p>
                </div>

                <button
                  className="trigger-scene-btn"
                  onClick={() => triggerScene(scene)}
                  disabled={executing === scene.id}
                >
                  {executing === scene.id ? "Activating..." : "Activate Scene →"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Automated Rules & Triggers */}
      <section className="automations-section">
        <div className="section-title-bar">
          <div>
            <h2>Automated Rules & Schedules ⏰</h2>
            <p>Time-based and state-driven smart triggers</p>
          </div>
          <button
            className="add-btn"
            onClick={() => setShowAutoForm(!showAutoForm)}
          >
            {showAutoForm ? "Cancel" : "+ Add Automation"}
          </button>
        </div>

        {showAutoForm && (
          <div className="form-card">
            <h3>New Automation Rule</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Automation Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sunset Lighting"
                  value={autoName}
                  onChange={(e) => setAutoName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Trigger Condition Type</label>
                <select
                  value={triggerType}
                  onChange={(e) =>
                    setTriggerType(e.target.value as "TIME" | "DEVICE_STATE")
                  }
                >
                  <option value="TIME">Time-Based Schedule (Clock)</option>
                  <option value="DEVICE_STATE">Device State Trigger</option>
                </select>
              </div>

              {triggerType === "TIME" ? (
                <div className="form-group">
                  <label>Scheduled Time (24h)</label>
                  <input
                    type="time"
                    value={triggerTime}
                    onChange={(e) => setTriggerTime(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Trigger Device</label>
                    <select
                      value={triggerDeviceId}
                      onChange={(e) => setTriggerDeviceId(e.target.value)}
                    >
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>When Device Becomes</label>
                    <select
                      value={triggerState}
                      onChange={(e) =>
                        setTriggerState(e.target.value as "ON" | "OFF")
                      }
                    >
                      <option value="ON">ON 🟢</option>
                      <option value="OFF">OFF ⚫</option>
                    </select>
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Action Scene to Execute</label>
                <select
                  value={targetSceneId}
                  onChange={(e) => setTargetSceneId(e.target.value)}
                >
                  {scenes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button className="save-btn" onClick={createAutomation}>
              Save Automation Rule
            </button>
          </div>
        )}

        <div className="automations-list">
          {automations.map((auto) => {
            const targetScene = scenes.find((s) => s.id === auto.sceneId);
            const trigger = auto.trigger;
            const triggerDevice =
              trigger.type === "DEVICE_STATE"
                ? devices.find((d) => d.id === trigger.deviceId)
                : null;

            return (
              <div className="automation-item" key={auto.id}>
                <div className="auto-info">
                  <strong>{auto.name}</strong>
                  <span className="auto-trigger-tag">
                    {trigger.type === "TIME"
                      ? `⏰ Scheduled daily at ${trigger.time}`
                      : `⚡ When ${triggerDevice?.name || "Device"} turns ${
                          trigger.expectedState
                        }`}
                  </span>
                  {targetScene && (
                    <span className="auto-target-scene">
                      Runs: {targetScene.name}
                    </span>
                  )}
                </div>

                <div className="auto-toggle-wrapper">
                  <span className={`auto-status ${auto.enabled ? "on" : "off"}`}>
                    {auto.enabled ? "Active" : "Disabled"}
                  </span>
                  <button
                    className={`toggle-switch ${auto.enabled ? "active" : ""}`}
                    onClick={() => toggleAutomation(auto.id)}
                  >
                    {auto.enabled ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={() => deleteAutomation(auto.id)}
                    title="Delete Automation"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#94a3b8",
                      cursor: "pointer",
                      fontSize: "14px",
                      padding: "4px",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default AutomationsPage;
