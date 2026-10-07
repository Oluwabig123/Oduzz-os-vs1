import React, { useState, useMemo } from "react";
import "./ActivityLogView.css";

export type ActivityItem = {
  id: string;
  device_id: string;
  command: string;
  result: string;
  created_at: string;
};

export type DeviceLookup = {
  id: string;
  room_id: string;
  name: string;
  device_type: string;
};

export type RoomLookup = {
  id: string;
  name: string;
};

export type ActivityLogViewProps = {
  activities: ActivityItem[];
  devices: DeviceLookup[];
  rooms: RoomLookup[];
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
};

type FilterType = "ALL" | "ON" | "OFF" | "VOICE" | "SCENE";
type StatusFilter = "ALL" | "SUCCESS" | "FAILED" | "PENDING";

export const ActivityLogView: React.FC<ActivityLogViewProps> = ({
  activities,
  devices,
  rooms,
  onRefresh,
  isRefreshing = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterType>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Device & Room Map helper
  const deviceMap = useMemo(() => {
    const map = new Map<string, DeviceLookup>();
    for (const d of devices) map.set(d.id, d);
    return map;
  }, [devices]);

  const roomMap = useMemo(() => {
    const map = new Map<string, RoomLookup>();
    for (const r of rooms) map.set(r.id, r);
    return map;
  }, [rooms]);

  function getDeviceInfo(deviceId: string) {
    const device = deviceMap.get(deviceId);
    if (!device) return { deviceName: "Unknown Device", roomName: "General" };
    const room = roomMap.get(device.room_id);
    return {
      deviceName: device.name,
      roomName: room ? room.name : "Unassigned Room",
      deviceType: device.device_type,
    };
  }

  function getRelativeTime(timestamp: string): string {
    const now = new Date().getTime();
    const past = new Date(timestamp).getTime();
    const diffSec = Math.floor((now - past) / 1000);

    if (diffSec < 10) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}d ago`;
  }

  function formatFullDateTime(timestamp: string): string {
    try {
      return new Date(timestamp).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return timestamp;
    }
  }

  function parseCommandType(command: string): {
    badgeLabel: string;
    badgeClass: string;
    category: FilterType;
  } {
    const upper = (command || "").toUpperCase();
    if (upper.includes("TURN_ON") || upper.includes("SWITCH_ON") || upper.includes("ON")) {
      return { badgeLabel: "⚡ TURN ON", badgeClass: "badge-on", category: "ON" };
    }
    if (upper.includes("TURN_OFF") || upper.includes("SWITCH_OFF") || upper.includes("OFF")) {
      return { badgeLabel: "🌑 TURN OFF", badgeClass: "badge-off", category: "OFF" };
    }
    if (upper.includes("VOICE") || upper.includes("INTENT")) {
      return { badgeLabel: "🎙️ VOICE", badgeClass: "badge-voice", category: "VOICE" };
    }
    if (upper.includes("SCENE") || upper.includes("MODE") || upper.includes("MOVIE") || upper.includes("NIGHT")) {
      return { badgeLabel: "🎬 SCENE", badgeClass: "badge-scene", category: "SCENE" };
    }
    return { badgeLabel: "⚙️ COMMAND", badgeClass: "badge-default", category: "ALL" };
  }

  function parseResultStatus(result: string): {
    label: string;
    statusClass: string;
    statusCategory: StatusFilter;
  } {
    const res = (result || "").toUpperCase();
    if (res.includes("FAIL") || res.includes("ERR") || res.includes("DENIED")) {
      return { label: "Failed", statusClass: "status-failed", statusCategory: "FAILED" };
    }
    if (res.includes("PENDING") || res.includes("WAIT")) {
      return { label: "Pending", statusClass: "status-pending", statusCategory: "PENDING" };
    }
    return { label: "Success", statusClass: "status-success", statusCategory: "SUCCESS" };
  }

  // Filtered Activities
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      const { deviceName, roomName } = getDeviceInfo(act.device_id);
      const { category } = parseCommandType(act.command);
      const { statusCategory } = parseResultStatus(act.result);

      // Search query check
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesDevice = deviceName.toLowerCase().includes(query);
        const matchesRoom = roomName.toLowerCase().includes(query);
        const matchesCommand = (act.command || "").toLowerCase().includes(query);
        const matchesResult = (act.result || "").toLowerCase().includes(query);
        if (!matchesDevice && !matchesRoom && !matchesCommand && !matchesResult) {
          return false;
        }
      }

      // Type filter check
      if (typeFilter !== "ALL" && category !== typeFilter) {
        return false;
      }

      // Status filter check
      if (statusFilter !== "ALL" && statusCategory !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [activities, searchQuery, typeFilter, statusFilter, deviceMap, roomMap]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = activities.length;
    let successful = 0;
    for (const a of activities) {
      if (parseResultStatus(a.result).statusCategory === "SUCCESS") successful++;
    }
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 100;
    return { total, successful, successRate };
  }, [activities]);

  const copyLogDetails = (act: ActivityItem) => {
    const { deviceName, roomName } = getDeviceInfo(act.device_id);
    const json = JSON.stringify(
      {
        id: act.id,
        device: deviceName,
        room: roomName,
        deviceId: act.device_id,
        command: act.command,
        result: act.result,
        timestamp: act.created_at,
      },
      null,
      2
    );
    navigator.clipboard.writeText(json);
    setCopiedId(act.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="oduzz-activity-logger">
      {/* Header telemetry and live status */}
      <div className="logger-telemetry-header">
        <div className="telemetry-live-pill">
          <span className="live-pulse-dot" />
          <span>Real-Time Event Stream</span>
        </div>

        <div className="telemetry-metrics">
          <span className="metric-item">
            <strong>{stats.total}</strong> Total Events
          </span>
          <span className="metric-divider">|</span>
          <span className="metric-item highlight">
            <strong>{stats.successRate}%</strong> Success Rate
          </span>
        </div>

        {onRefresh && (
          <button
            className={`logger-refresh-btn ${isRefreshing ? "refreshing" : ""}`}
            onClick={() => onRefresh()}
            disabled={isRefreshing}
            title="Refresh logs from Supabase"
          >
            ↻ {isRefreshing ? "Updating..." : "Refresh"}
          </button>
        )}
      </div>

      {/* Search and Filter Toolbar */}
      <div className="logger-toolbar">
        <div className="logger-search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by device, room, or command..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="logger-search-input"
          />
          {searchQuery && (
            <button
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>

        {/* Command Type Filter Pills */}
        <div className="logger-type-filters">
          <button
            className={`filter-pill ${typeFilter === "ALL" ? "active" : ""}`}
            onClick={() => setTypeFilter("ALL")}
          >
            All Types
          </button>
          <button
            className={`filter-pill on-pill ${typeFilter === "ON" ? "active" : ""}`}
            onClick={() => setTypeFilter("ON")}
          >
            ⚡ Turn On
          </button>
          <button
            className={`filter-pill off-pill ${typeFilter === "OFF" ? "active" : ""}`}
            onClick={() => setTypeFilter("OFF")}
          >
            🌑 Turn Off
          </button>
          <button
            className={`filter-pill voice-pill ${typeFilter === "VOICE" ? "active" : ""}`}
            onClick={() => setTypeFilter("VOICE")}
          >
            🎙️ Voice
          </button>
          <button
            className={`filter-pill scene-pill ${typeFilter === "SCENE" ? "active" : ""}`}
            onClick={() => setTypeFilter("SCENE")}
          >
            🎬 Scenes
          </button>
        </div>

        {/* Status Dropdown */}
        <div className="logger-status-select-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="logger-status-select"
          >
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">✅ Success</option>
            <option value="PENDING">⏳ Pending</option>
            <option value="FAILED">❌ Failed</option>
          </select>
        </div>
      </div>

      {/* Active Filter Notice */}
      {(searchQuery || typeFilter !== "ALL" || statusFilter !== "ALL") && (
        <div className="active-filters-bar">
          <span>
            Showing <strong>{filteredActivities.length}</strong> of {activities.length} logs
          </span>
          <button
            className="clear-all-filters-btn"
            onClick={() => {
              setSearchQuery("");
              setTypeFilter("ALL");
              setStatusFilter("ALL");
            }}
          >
            Clear Filters ✕
          </button>
        </div>
      )}

      {/* Activity Logs Stream List */}
      <div className="logger-feed-container">
        {filteredActivities.length === 0 ? (
          <div className="logger-empty-state">
            <span className="empty-icon">📋</span>
            <h4>No activity logs match your criteria</h4>
            <p>Try clearing search queries or adjusting command filters.</p>
          </div>
        ) : (
          <div className="logger-entries-list">
            {filteredActivities.map((act) => {
              const { deviceName, roomName } = getDeviceInfo(act.device_id);
              const { badgeLabel, badgeClass } = parseCommandType(act.command);
              const { label: statusLabel, statusClass } = parseResultStatus(act.result);
              const isExpanded = expandedLogId === act.id;

              return (
                <div
                  key={act.id}
                  className={`log-row-card ${isExpanded ? "expanded" : ""}`}
                  onClick={() => setExpandedLogId(isExpanded ? null : act.id)}
                >
                  <div className="log-row-main">
                    {/* Command Badge */}
                    <span className={`log-command-badge ${badgeClass}`}>
                      {badgeLabel}
                    </span>

                    {/* Target Device & Room */}
                    <div className="log-target-info">
                      <span className="target-device-name">{deviceName}</span>
                      <span className="target-room-name">📍 {roomName}</span>
                    </div>

                    {/* Execution Result Status */}
                    <span className={`log-status-pill ${statusClass}`}>
                      {statusLabel}
                    </span>

                    {/* Relative & Hover Full Time */}
                    <div className="log-time-column" title={formatFullDateTime(act.created_at)}>
                      <time className="relative-time">{getRelativeTime(act.created_at)}</time>
                      <span className="expand-indicator">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Expandable Telemetry Drawer */}
                  {isExpanded && (
                    <div
                      className="log-details-drawer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="details-grid">
                        <div className="detail-item">
                          <span className="detail-label">Exact Command:</span>
                          <code className="detail-code">{act.command || "N/A"}</code>
                        </div>

                        <div className="detail-item">
                          <span className="detail-label">Execution Result:</span>
                          <code className="detail-code">{act.result || "Executed"}</code>
                        </div>

                        <div className="detail-item">
                          <span className="detail-label">Timestamp:</span>
                          <span className="detail-value">{formatFullDateTime(act.created_at)}</span>
                        </div>

                        <div className="detail-item">
                          <span className="detail-label">Target Device ID:</span>
                          <span className="detail-value-mono">{act.device_id}</span>
                        </div>
                      </div>

                      <div className="drawer-actions">
                        <button
                          className="copy-log-btn"
                          onClick={() => copyLogDetails(act)}
                        >
                          {copiedId === act.id ? "✓ Copied JSON" : "📋 Copy Log JSON"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLogView;
