"use client";

import dynamic from "next/dynamic";
import {
  BarVisualizer,
  DisconnectButton,
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  VoiceAssistantControlBar,
  useVoiceAssistant,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { Track, Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useState } from "react";
import TranscriptionView from "@/components/TranscriptionView";
import { CloseIcon } from "@/components/CloseIcon";
import { NoAgentNotification } from "@/components/NoAgentNotification";
import useCombinedTranscriptions from "@/hooks/useCombinedTranscriptions";

// ────────────────────────────────────────────────────────────
// Chart.js setup (client-only bundles)
// ────────────────────────────────────────────────────────────
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  CategoryScale,
  LinearScale,
  BarElement
);
const Doughnut = dynamic(
  () => import("react-chartjs-2").then((m) => m.Doughnut),
  { ssr: false }
);
const Radar = dynamic(() => import("react-chartjs-2").then((m) => m.Radar), {
  ssr: false,
});
const Bar = dynamic(() => import("react-chartjs-2").then((m) => m.Bar), {
  ssr: false,
});

// ────────────────────────────────────────────────────────────
// Types & helpers
// ────────────────────────────────────────────────────────────
type Prompt = {
  topic: string;
  instructions: string;
  hard_skills: string[];
};

async function fetchPrompts(): Promise<Prompt[]> {
  const res = await fetch("/api/prompts");
  if (!res.ok) throw new Error("Failed to load prompt catalogue");
  return res.json();
}

async function analyzeTranscript(
  text: string,
  hardSkills: string[]
): Promise<{ scores: Record<string, number>; summary: string }> {
  const res = await fetch("/api/analyze-transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: text, hardSkills }),
  });
  if (!res.ok) throw new Error("Transcript analysis failed");
  return res.json();
}

// Soft-skills stay static for now
const SOFT_SKILLS = [
  "Communication",
  "Teamwork",
  "Attitude",
  "Professionalism",
  "Leadership",
  "Creativity",
  "Sociability",
];

// ────────────────────────────────────────────────────────────
// Page component
// ────────────────────────────────────────────────────────────
export default function Page() {
  const [room] = useState(new Room());

  // prompt catalogue + selection
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selected, setSelected] = useState<Prompt | null>(null);

  // hard-skill list chosen for the running interview
  const [activeHardSkills, setActiveHardSkills] = useState<string[]>([]);

  // fetch catalogue once
  useEffect(() => {
    fetchPrompts().then(setPrompts).catch(console.error);
  }, []);

  const connectAndStart = useCallback(async () => {
    if (!selected) {
      alert("Please select an interview topic first.");
      return;
    }
  
    // 1) Create/connect to LiveKit room, embedding your prompt JSON as metadata
    const res = await fetch("/api/connection-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: selected }),    // ← send the full prompt object here
    });
  
    if (!res.ok) {
      console.error("Failed to get connection details", await res.text());
      alert("Could not start interview. See console.");
      return;
    }
  
    const { serverUrl, participantToken } = await res.json();
  
    // 2) Store the selected hard_skills for your analytics charts
    setActiveHardSkills(selected.hard_skills);
  
    // 3) Finally, connect your LiveKit client
    await room.connect(serverUrl, participantToken);
    await room.localParticipant.setMicrophoneEnabled(true);
    await room.localParticipant.setCameraEnabled(true);
  }, [room, selected]);
  

  useEffect(() => {
    room.on(RoomEvent.MediaDevicesError, onDeviceFailure);
      return () => {
          room.off(RoomEvent.MediaDevicesError, onDeviceFailure);
        };
  }, [room]);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* ─── Header ─── */}
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow">
        <button className="text-2xl">←</button>
        <h1 className="text-xl font-semibold">Interview Test</h1>

        {/* Dynamic topic selector */}
        <select
          className="border rounded px-2 py-1"
          value={selected?.topic ?? ""}
          onChange={(e) =>
            setSelected(
              prompts.find((p) => p.topic === e.target.value) ?? null
            )
          }
        >
          <option value="" disabled>
            Select role…
          </option>
          {prompts.map((p) => (
            <option key={p.topic}>{p.topic}</option>
          ))}
        </select>

        <button className="ml-4 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white">
          AI Career Coach
        </button>
        <div className="flex items-center space-x-4">
          <button>🔧</button>
          <button>🔔</button>
          <img
            src="/avatar.png"
            alt="User avatar"
            className="w-8 h-8 rounded-full"
          />
        </div>
      </header>

      {/* ─── Main layout ─── */}
      <RoomContext.Provider value={room}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 px-6 py-8">
          <section className="lg:col-span-2 space-y-6">
            <VoiceApp onStart={connectAndStart} />
            <AnalyticsSection hardSkills={activeHardSkills} />
          </section>
          <aside className="space-y-6">
            <ScoreSummary />
            <TranscriptPanel />
          </aside>
        </div>
      </RoomContext.Provider>
    </main>
  );
}

// ────────────────────────────────────────────────────────────
// Voice-assistant wrapper
// ────────────────────────────────────────────────────────────
function VoiceApp({ onStart }: { onStart: () => void }) {
  const { state, videoTrack, audioTrack, agentTranscriptions } =
    useVoiceAssistant();
  const [transcripts, setTranscripts] = useState<string[]>([]);

  useEffect(() => {
    if (agentTranscriptions) {
      setTranscripts(agentTranscriptions.map((seg) => seg.text));
    }
  }, [agentTranscriptions]);

  const isInitial = state === "disconnected" && transcripts.length === 0;
  const isActive = state !== "disconnected";
  const isEnded = state === "disconnected" && transcripts.length > 0;

  return (
    <>
      {isInitial && <StartPanel onStart={onStart} />}
      {isActive && (
        <LiveInterview videoTrack={videoTrack} audioTrack={audioTrack} />
      )}
      {isEnded && <EndPanel onStart={onStart} />}
    </>
  );
}

function LiveInterview({ videoTrack, audioTrack }: any) {
  const { state } = useVoiceAssistant();
  const room = useRoomContext();
  const trackRefs = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const localCam = trackRefs.find((t) => t.participant === room.localParticipant);

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-6">
      {localCam && (
        <div className="h-48 w-full rounded-lg overflow-hidden">
          <VideoTrack trackRef={localCam} />
        </div>
      )}
      {videoTrack ? (
        <div className="h-80 w-full rounded-lg overflow-hidden">
          <VideoTrack trackRef={videoTrack} />
        </div>
      ) : (
        <div className="h-48 w-full">
          <BarVisualizer
            state={state}
            barCount={5}
            trackRef={audioTrack}
            options={{ minHeight: 24 }}
          />
        </div>
      )}
      <TranscriptionView />
      <div className="flex justify-center space-x-4">
        <VoiceAssistantControlBar controls={{ leave: false }} />
        <DisconnectButton>
          <CloseIcon />
        </DisconnectButton>
      </div>
      <RoomAudioRenderer />
      <NoAgentNotification state={state} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Simple panels
// ────────────────────────────────────────────────────────────
function StartPanel({ onStart }: { onStart: () => void }) {
  return (
    <div className="bg-white rounded-lg shadow p-8 text-center">
      <h2 className="text-2xl font-bold mb-2">Start Your AI Interview Test</h2>
      <p className="mb-6 text-gray-600">
        Ready to showcase your skills? Begin the AI-powered interview now.
      </p>
      <button
        onClick={onStart}
        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Start Now
      </button>
    </div>
  );
}

function EndPanel({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative bg-white rounded-lg shadow overflow-hidden">
      <img
        src="/robot.png"
        alt="Interview ended"
        className="w-full h-64 object-cover"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-40 text-white p-8">
        <h2 className="text-2xl font-bold mb-2">
          You've Finished the AI Interview!
        </h2>
        <p className="mb-6">Ready to try again or improve your score?</p>
        <button
          onClick={onStart}
          className="px-6 py-2 bg-blue-500 rounded-md hover:bg-blue-600"
        >
          Test Again
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Analytics
// ────────────────────────────────────────────────────────────
function AnalyticsSection({ hardSkills }: { hardSkills: string[] }) {
  const { state } = useVoiceAssistant();
  const combined = useCombinedTranscriptions();

  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "disconnected" || combined.length === 0) return;

    const full = combined
      .map(({ role, text }) =>
        role === "user" ? `Candidate: ${text}` : `Interviewer: ${text}`
      )
      .join("\n");

    analyzeTranscript(full, hardSkills)
      .then(({ scores, summary }) => {
        setMetrics(scores);
        setSummary(summary);
      })
      .catch(console.error);
  }, [state, combined, hardSkills]);

  if (!metrics || !summary) return null;

  const softData = SOFT_SKILLS.map((l) => metrics[l] ?? 0);
  const hardData = hardSkills.map((l) => metrics[l] ?? 0);

  return (
    <div className="space-y-6">
      {/* summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-2">Candidate Summary</h3>
        <p className="text-gray-700">{summary}</p>
      </div>

      {/* charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Soft-Skill Breakdown</h3>
          <Radar
            data={{
              labels: SOFT_SKILLS,
              datasets: [
                { label: "Score (0–100)", data: softData, fill: true },
              ],
            }}
            options={{
              scales: {
                r: { min: 0, max: 100, ticks: { stepSize: 20 } },
              },
            }}
          />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Hard-Skill Breakdown</h3>
          <Bar
            data={{
              labels: hardSkills,
              datasets: [{ label: "Score (0–100)", data: hardData }],
            }}
            options={{
              indexAxis: "y",
              scales: {
                x: { min: 0, max: 100, ticks: { stepSize: 20 } },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Misc UI helpers
// ────────────────────────────────────────────────────────────
function ScoreSummary() {
  const overall = 85;
  const parts = [85, 85, 85];
  const data = {
    labels: ["Interview", "Resume", "Case Study"],
    datasets: [
      {
        data: parts,
        backgroundColor: ["#3b82f6", "#3b82f6", "#3b82f6"],
        hoverOffset: 4,
      },
    ],
  };
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Overall Score Summary</h3>
      <Doughnut data={data} />
      <p className="text-center text-2xl font-bold mt-2">{overall}%</p>
    </div>
  );
}

function TranscriptPanel() {
  const combined = useCombinedTranscriptions();
  if (combined.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow p-6 max-h-96 overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4">Interview Transcript</h3>
      <div className="space-y-2 text-gray-700 text-sm">
        {combined.map(({ id, role, text }) => (
          <p key={id}>
            <strong>{role === "user" ? "Candidate" : "Interviewer"}:</strong>{" "}
            {text}
          </p>
        ))}
      </div>
    </div>
  );
}

function onDeviceFailure(err: Error) {
  console.error(err);
  alert(
    "Error acquiring camera or microphone permissions. Please enable permissions and reload."
  );
}
