import { supabase } from "../lib/supabase";

export async function processPendingCommands() {
  const { data: commands, error } = await supabase
    .from("device_commands")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading commands:", error);
    return;
  }

  if (!commands || commands.length === 0) {
    console.log("Virtual Hub: No pending commands.");
    return;
  }

  for (const command of commands) {
    console.log(
      `Virtual Hub: Processing ${command.command} for device ${command.device_id}`
    );

    let desiredState: string;

    if (command.command === "TURN_ON") {
      desiredState = "ON";
    } else if (command.command === "TURN_OFF") {
      desiredState = "OFF";
    } else {
      console.error(`Virtual Hub: Unknown command ${command.command}`);
      continue;
    }

    // 1. Update desired state
    const { error: desiredStateError } = await supabase
      .from("device_states")
      .update({
        desired_state: desiredState,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", command.device_id);

    if (desiredStateError) {
      console.error(
        "Error updating desired state:",
        desiredStateError
      );
      continue;
    }

    // 2. Simulate physical device response
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 3. Update actual state
    const { error: actualStateError } = await supabase
      .from("device_states")
      .update({
        actual_state: desiredState,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", command.device_id);

    if (actualStateError) {
      console.error(
        "Error updating actual state:",
        actualStateError
      );
      continue;
    }

    // 4. Record activity
    const { data: activityData, error: activityError } = await supabase
      .from("device_activity")
      .insert({
        device_id: command.device_id,
        command: command.command,
        result: "success",
      })
      .select();

    if (activityError) {
      console.error(
        "❌ Error recording device activity:",
        activityError
      );
      continue;
    }

    console.log(
      "✅ Device activity recorded:",
      activityData
    );

    // 5. Mark command completed
    const { error: commandError } = await supabase
      .from("device_commands")
      .update({
        status: "completed",
        executed_at: new Date().toISOString(),
      })
      .eq("id", command.id);

    if (commandError) {
      console.error(
        "Error completing command:",
        commandError
      );
      continue;
    }

    console.log(
      `Virtual Hub: ${command.command} completed successfully.`
    );
  }
}

let hubRunning = false;

export function startVirtualHub() {
  if (hubRunning) {
    return;
  }

  hubRunning = true;

  console.log("🚀 Virtual Hub started");

  processPendingCommands();

  const interval = setInterval(() => {
    processPendingCommands();
  }, 2000);

  return () => {
    clearInterval(interval);
    hubRunning = false;
    console.log("🛑 Virtual Hub stopped");
  };
}