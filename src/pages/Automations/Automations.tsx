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
      <div className="automations-container">
        <div className="automations-header">
          <div>
            <div className="page-eyebrow">INTELLIGENT WORKFLOWS</div>
            <h1>Automations & Scenes</h1>
            <p>Configure smart triggers, one-tap multi-device scenes, and scheduled routines</p>
          </div>
        </div>

        {bannerMessage && (
          <div className="automation-notice-banner" role="status">
            <span>⚡ {bannerMessage}</span>
            <button
              onClick={() => setBannerMessage(null)}
              className="automation-notice-close"
              aria-label="Dismiss notice"
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
              <p>One-tap multi-device action routines (also voice-activated via "Hey Oduzz")</p>
            </div>
            <button
              className={`add-btn ${showSceneForm ? "btn-cancel" : ""}`}
              onClick={() => setShowSceneForm(!showSceneForm)}
            >
              {showSceneForm ? "✕ Cancel" : "+ Create Scene"}
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
                  <label>Select Target Device</label>
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
                  <div className="inline-action-builder">
                    <select
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
                      className="add-draft-action-btn"
                      onClick={addDraftAction}
                      disabled={!selectedDeviceId}
                    >
                      + Add Action
                    </button>
                  </div>
                </div>
              </div>

              {draftActions.length > 0 && (
                <div className="draft-actions-list">
                  {draftActions.map((act) => {
                    const dev = devices.find((d) => d.id === act.deviceId);
                    return (
                      <span key={act.deviceId} className="draft-action-chip">
                        <span>
                          {dev?.name || "Device"} →{" "}
                          <strong>{act.command === "TURN_ON" ? "ON" : "OFF"}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDraftAction(act.deviceId)}
                          className="draft-chip-remove"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="form-actions-row">
                <button className="save-btn" onClick={createScene}>
                  Save Scene Preset
                </button>
              </div>
            </div>
          )}

          <div className="scenes-grid">
            {scenes.map((scene) => {
              const isDefault =
                scene.id.startsWith("scene-movie") ||
                scene.id.startsWith("scene-night") ||
                scene.id.startsWith("scene-welcome");

              return (
                <div className="scene-card" key={scene.id}>
                  <div>
                    <div className="scene-card-header">
                      <h3>{scene.name}</h3>
                      <div className="scene-header-actions">
                        <span className="scene-badge">
                          {scene.actions.length > 0
                            ? `${scene.actions.length} Action${scene.actions.length > 1 ? "s" : ""}`
                            : "Smart Preset"}
                        </span>
                        {!isDefault && (
                          <button
                            onClick={() => deleteScene(scene.id)}
                            title="Delete Scene"
                            className="icon-trash-btn"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <p>{scene.description}</p>
                  </div>

                  <button
                    className={`trigger-scene-btn ${executing === scene.id ? "executing" : ""}`}
                    onClick={() => triggerScene(scene)}
                    disabled={executing === scene.id}
                  >
                    <span>
                      {executing === scene.id ? "Executing Scene..." : "Activate Scene"}
                    </span>
                    <span className="scene-btn-arrow">→</span>
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
              <p>Time-based and device state-driven smart triggers</p>
            </div>
            <button
              className={`add-btn ${showAutoForm ? "btn-cancel" : ""}`}
              onClick={() => setShowAutoForm(!showAutoForm)}
            >
              {showAutoForm ? "✕ Cancel" : "+ Add Automation"}
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
                    <option value="TIME">⏰ Time-Based Schedule (Clock)</option>
                    <option value="DEVICE_STATE">⚡ Device State Trigger</option>
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
              <div className="form-actions-row">
                <button className="save-btn" onClick={createAutomation}>
                  Save Automation Rule
                </button>
              </div>
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
                <div
                  className={`automation-item ${auto.enabled ? "item-enabled" : "item-disabled"}`}
                  key={auto.id}
                >
                  <div className="auto-info">
                    <div className="auto-title-row">
                      <strong>{auto.name}</strong>
                      <span className={`auto-status ${auto.enabled ? "on" : "off"}`}>
                        {auto.enabled ? "Active" : "Paused"}
                      </span>
                    </div>
                    <div className="auto-meta-row">
                      <span className="auto-trigger-tag">
                        {trigger.type === "TIME"
                          ? `⏰ Daily at ${trigger.time}`
                          : `⚡ When ${triggerDevice?.name || "Device"} turns ${
                              trigger.expectedState
                            }`}
                      </span>
                      {targetScene && (
                        <span className="auto-target-scene">
                          → {targetScene.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="auto-toggle-wrapper">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={auto.enabled}
                      className={`modern-switch ${auto.enabled ? "active" : ""}`}
                      onClick={() => toggleAutomation(auto.id)}
                      title={auto.enabled ? "Disable rule" : "Enable rule"}
                    >
                      <span className="switch-thumb" />
                    </button>

                    <button
                      onClick={() => deleteAutomation(auto.id)}
                      title="Delete Automation"
                      className="icon-trash-btn"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

export default AutomationsPage;
