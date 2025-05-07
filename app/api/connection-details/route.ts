import { NextRequest, NextResponse } from "next/server";
import {
  RoomServiceClient,
  AccessToken,
  AccessTokenOptions,
  VideoGrant,
} from "livekit-server-sdk";

// Next.js has already loaded .env*.local into process.env :contentReference[oaicite:5]{index=5}
const {
  LIVEKIT_URL,        // e.g. "wss://your.livekit.host"
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
} = process.env;

// No caching—always fresh room & token
export const revalidate = 0;

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantIdentity: string;
  participantToken: string;
};

const svc = new RoomServiceClient(
  LIVEKIT_URL!, 
  LIVEKIT_API_KEY!, 
  LIVEKIT_API_SECRET!
);

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();
  if (!prompt?.topic) {
    return NextResponse.json(
      { error: "Missing prompt.topic in request body" },
      { status: 400 }
    );
  }

  // Create a new LiveKit room with metadata containing the prompt JSON
  const roomName = `interview-${crypto.randomUUID()}`;
  await svc.createRoom({
    name: roomName,
    metadata: JSON.stringify(prompt),   // metadata for Python worker
    emptyTimeout: 600,
  });

  // Issue a participant token
  const participantIdentity = `voice_assistant_user_${crypto.randomUUID()}`;
  const at = new AccessToken(
    LIVEKIT_API_KEY!,
    LIVEKIT_API_SECRET!,
    { identity: participantIdentity } as AccessTokenOptions
  );
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };
  at.addGrant(grant);
  const participantToken = await at.toJwt();

  return NextResponse.json<ConnectionDetails>({
    serverUrl: LIVEKIT_URL!.replace(/^http/, "ws"),
    roomName,
    participantIdentity,
    participantToken,
  });
}
