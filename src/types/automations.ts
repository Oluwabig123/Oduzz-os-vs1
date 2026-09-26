// Milestone 3 Preview — Automation & Scene Type Definitions

export type SceneAction = {
  deviceId: string;
  command: "TURN_ON" | "TURN_OFF";
};

export type Scene = {
  id: string;
  homeId: string;
  name: string; // e.g. "Movie Mode", "Night Mode", "Away Mode", "Welcome Home"
  description: string;
  actions: SceneAction[];
};

export type AutomationTrigger =
  | { type: "TIME"; time: string } // e.g. "19:00"
  | { type: "DEVICE_STATE"; deviceId: string; expectedState: "ON" | "OFF" };

export type Automation = {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  sceneId?: string;
  actions?: SceneAction[];
  enabled: boolean;
};
