import { postAniListGraphql } from "@/main/ipc/anilist/anilist-api";

interface ViewerPayload {
  Viewer: {
    id: number;
    name?: string | null;
  } | null;
}

export async function fetchAniListViewerName(accessToken: string): Promise<string | null> {
  const query = "query { Viewer { id name } }";
  try {
    const data = await postAniListGraphql<ViewerPayload>(
      query,
      {},
      { Authorization: `Bearer ${accessToken}` }
    );

    const name = data.Viewer?.name;
    return typeof name === "string" && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}
