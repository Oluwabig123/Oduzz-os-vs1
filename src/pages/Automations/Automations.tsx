import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Scene, Automation } from "../../types/automations";
import "./Automations.css";

type Device = {
  id: string;
  name: string;
};

function AutomationsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);

  // Scene Form state
  const [showSceneForm, setShowSceneForm] = useState(false);
  const [sceneName, setSceneName] = useState("");
  const [sceneDesc, setSceneDesc] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [sceneCommand, setSceneCommand] = useState<"TURN_ON" | "TURN_OFF">("TURN_ON");

  // Automation Form state
  const [showAutoForm, setShowAutoForm] = useState(false);
  const [autoName, setAutoName] = useState("");
  const [triggerType, setTriggerType] = useState<"TIME" | "DEVICE_STATE">("TIME");
  const [triggerTime, setTriggerTime] = useState("19:00");
  const [triggerDeviceId, setTriggerDeviceId] = useState("");
  const [triggerState, setTriggerState] = useState<"ON" | "OFF">("ON");
  const [targetSceneId, setTargetSceneId] = useState("");

  const [executing, setExecuting] = useState<string | null>(null);

  useEffect(() => {
    loadDevices();
    loadInitialData();
  }, []);

  async function loadDevices() {
    const { data } = await supabase.from("devices").select("id, name");
    setDevices(data || []);
    if (data && data.length > 0) {
      setSelectedDeviceId(data[0].id);
      setTriggerDeviceId(data[0].id);
    }
  }

  function loadInitialData() {
    const defaultScenes: Scene[] = [
      {
        id: "scene-movie",
        homeId: "default",
        name: "Movie Mode 🎬",
        description: "Dims lights and turns on ambient media display",
        actions: [],
      },
      {
        id: "scene-night",
        homeId: "default",
        name: "Night Mode 🌙",
        description: "Turns off all main home appliances and arms security lights",
        actions: [],
      },
      {
        id: "scene-welcome",
        homeId: "default",
        name: "Welcome Home 🏠",
        description: "Turns on living room light and air conditioner",
        actions: [],
      },
    ];

    const defaultAutomations: Automation[] = [
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

    setScenes(defaultScenes);
    setAutomations(defaultAutomations);
  }

  async function triggerScene(scene: Scene) {
    setExecuting(scene.id);

    if (scene.actions.length === 0) {
      // Execute scene on all available devices if no explicit action specified
      if (devices.length > 0) {
        const commandRows = devices.map((dev) => ({
          device_id: dev.id,
          command: scene.name.includes("Night") ? "TURN_OFF" : "TURN_ON",
          status: "pending",
        }));

        await supabase.from("device_commands").insert(commandRows);
        const { processPendingCommands } = await import("../../hub/virtualHub");
        await processPendingCommands();
      }
    } else {
      const commandRows = scene.actions.map((act) => ({
        device_id: act.deviceId,
        command: act.command,
        status: "pending",
      }));

      await supabase.from("device_commands").insert(commandRows);
      const { processPendingCommands } = await import("../../hub/virtualHub");
      await processPendingCommands();
    }

    setTimeout(() => {
      setExecuting(null);
      alert(`Activated ${scene.name}! All associated device commands executed.`);
    }, 600);
  }

  function createScene() {
    if (!sceneName.trim()) {
      alert("Please enter a scene name.");
      return;
    }

    const newScene: Scene = {
      id: `scene-${Date.now()}`,
      homeId: "default",
      name: sceneName.trim(),
      description: sceneDesc.trim() || "Custom user configured scene preset",
      actions: selectedDeviceId
        ? [{ deviceId: selectedDeviceId, command: sceneCommand }]
        : [],
    };

    setScenes([newScene, ...scenes]);
    setSceneName("");
    setSceneDesc("");
    setShowSceneForm(false);
  }

  function createAutomation() {
    if (!autoName.trim()) {
      alert("Please enter an automation name.");
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

    setAutomations([newAuto, ...automations]);
    setAutoName("");
    setShowAutoForm(false);
  }

  function toggleAutomation(id: string) {
    setAutomations(
      automations.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
  }

  return (
    <div className="automations-page">
      <div className="automations-header">
        <div>
          <h1>Automations & Scenes</h1>
          <p>Configure smart triggers, preset scenes, and automated routines</p>
        </div>
      </div>

      {/* Preset Scenes Section */}
      <section className="automations-section">
        <div className="section-title-bar">
          <div>
            <h2>Preset Scenes 🎬</h2>
            <p>One-tap multi-device action routines</p>
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
                  placeholder="e.g. Turns on all lights and sockets"
                  value={sceneDesc}
                  onChange={(e) => setSceneDesc(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Target Device Action</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Action State</label>
                <select
                  value={sceneCommand}
                  onChange={(e) =>
                    setSceneCommand(e.target.value as "TURN_ON" | "TURN_OFF")
                  }
                >
                  <option value="TURN_ON">Turn ON 🟢</option>
                  <option value="TURN_OFF">Turn OFF ⚫</option>
                </select>
              </div>
            </div>
            <button className="save-btn" onClick={createScene}>
              Save Scene
            </button>
          </div>
        )}

        <div className="scenes-grid">
          {scenes.map((scene) => (
            <div className="scene-card" key={scene.id}>
              <div className="scene-card-header">
                <h3>{scene.name}</h3>
                <span className="scene-badge">Preset</span>
              </div>
              <p>{scene.description}</p>
              <button
                className="trigger-scene-btn"
                onClick={() => triggerScene(scene)}
                disabled={executing === scene.id}
              >
                {executing === scene.id ? "Activating..." : "Activate Scene →"}
              </button>
            </div>
          ))}
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

            return (
              <div className="automation-item" key={auto.id}>
                <div className="auto-info">
                  <strong>{auto.name}</strong>
                  <span className="auto-trigger-tag">
                    {auto.trigger.type === "TIME"
                      ? `⏰ Scheduled daily at ${auto.trigger.time}`
                      : `⚡ Triggered by device state change`}
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
