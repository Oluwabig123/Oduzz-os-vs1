import { supabase } from "./supabase";

export type ScopedHome = {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
};

export type ScopedRoom = {
  id: string;
  home_id: string;
  name: string;
  created_at?: string;
};

export type ScopedDevice = {
  id: string;
  room_id: string;
  name: string;
  device_type: string;
  device_uid?: string;
  created_at?: string;
};

/**
 * Fetches homes, rooms, and devices strictly scoped to the currently authenticated user.
 * Prevents cross-tenant data leaks when RLS is permissive for IoT nodes.
 */
export async function fetchUserScopedHierarchy(): Promise<{
  userId: string | null;
  homes: ScopedHome[];
  rooms: ScopedRoom[];
  devices: ScopedDevice[];
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id ?? null;
  if (!userId) {
    return { userId: null, homes: [], rooms: [], devices: [] };
  }

  const { data: homesData, error: homesError } = await supabase
    .from("homes")
    .select("id, name, address, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (homesError || !homesData || homesData.length === 0) {
    if (homesError) console.error("Error fetching user homes:", homesError);
    return { userId, homes: [], rooms: [], devices: [] };
  }

  const homeIds = homesData.map((h) => h.id);

  const { data: roomsData, error: roomsError } = await supabase
    .from("rooms")
    .select("id, home_id, name, created_at")
    .in("home_id", homeIds)
    .order("created_at", { ascending: true });

  if (roomsError || !roomsData || roomsData.length === 0) {
    if (roomsError) console.error("Error fetching user rooms:", roomsError);
    return { userId, homes: homesData, rooms: [], devices: [] };
  }

  const roomIds = roomsData.map((r) => r.id);

  const { data: devicesData, error: devicesError } = await supabase
    .from("devices")
    .select("id, room_id, name, device_type, device_uid, created_at")
    .in("room_id", roomIds)
    .order("created_at", { ascending: true });

  if (devicesError) {
    console.error("Error fetching user devices:", devicesError);
    return { userId, homes: homesData, rooms: roomsData, devices: [] };
  }

  return {
    userId,
    homes: homesData,
    rooms: roomsData,
    devices: devicesData ?? [],
  };
}
