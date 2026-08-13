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

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const { error: updateError } = await supabase
      .from("device_commands")
      .update({
        status: "completed",
        executed_at: new Date().toISOString(),
      })
      .eq("id", command.id);

    if (updateError) {
      console.error("Error completing command:", updateError);
    } else {
      console.log(
        `Virtual Hub: Command ${command.command} completed successfully.`
      );
    }
  }
}