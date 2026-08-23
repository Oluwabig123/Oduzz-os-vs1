import { supabase } from "../lib/supabase";

let processingCommands = false;

export async function processPendingCommands() {
  // Prevent two Virtual Hub processes from running at the same time
  if (processingCommands) {
    console.log("Virtual Hub: Already processing commands.");
    return;
  }

  processingCommands = true;

  try {
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
        console.error(
          `Virtual Hub: Unknown command ${command.command}`
        );
        continue;
      }

      // 1. Claim the command
      const { data: claimedCommand, error: claimError } =
        await supabase
          .from("device_commands")
          .update({
            status: "processing",
          })
          .eq("id", command.id)
          .eq("status", "pending")
          .select()
          .maybeSingle();

      if (claimError) {
        console.error(
          "Error claiming command:",
          claimError
        );
        continue;
      }

      // Another process may have already claimed it
      if (!claimedCommand) {
        console.log(
          `Virtual Hub: Command ${command.id} was already claimed.`
        );
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
        console.error(
          "Error updating desired state:",
          desiredStateError
        );

        await supabase
          .from("device_commands")
          .update({
            status: "failed",
          })
          .eq("id", command.id);

        continue;
      }

      // 3. Simulate physical device response
      await new Promise((resolve) =>
        setTimeout(resolve, 1000)
      );

      // 4. Update actual state
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

        await supabase
          .from("device_commands")
          .update({
            status: "failed",
          })
          .eq("id", command.id);

        continue;
      }

      // 5. Record activity
      const { data: activityData, error: activityError } =
        await supabase
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

        await supabase
          .from("device_commands")
          .update({
            status: "failed",
          })
          .eq("id", command.id);

        continue;
      }

      console.log(
        "✅ Device activity recorded:",
        activityData
      );

      // 6. Mark command completed
      const { error: commandError } = await supabase
        .from("device_commands")
        .update({
          status: "completed",
          executed_at: new Date().toISOString(),
        })
        .eq("id", command.id)
        .eq("status", "processing");

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

  console.log("🚀 Virtual Hub started");

  // Run immediately
  processPendingCommands();

  const interval = setInterval(() => {
    processPendingCommands();
  }, 2000);

  return () => {
    clearInterval(interval);
    hubRunning = false;
    processingCommands = false;

    console.log("🛑 Virtual Hub stopped");
  };
}