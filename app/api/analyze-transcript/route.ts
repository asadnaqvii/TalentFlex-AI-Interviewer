import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { transcript, hardSkills } = await request.json();

  if (!Array.isArray(hardSkills) || hardSkills.length === 0) {
    return NextResponse.json(
      { error: "hardSkills array missing" },
      { status: 400 },
    );
  }

  // Seven standard soft skills (still static—you can externalise these later)
  const softSkills = [
    "Communication",
    "Teamwork",
    "Attitude",
    "Professionalism",
    "Leadership",
    "Creativity",
    "Sociability",
  ];

  /* ▸ Build system prompt */
  const systemPrompt = `
You are an assistant that reads an interview transcript and returns two things:
1) A JSON object named "scores" where each key is exactly one skill from this list: ${[
    ...softSkills,
    ...hardSkills,
  ].join(", ")}, and each value is a number between 0 and 100.
2) A brief (2–3 sentence) overall summary of the candidate’s performance, returned under the key "summary".

Respond with valid JSON containing exactly two top-level keys: "scores" and "summary". Do not include any extra commentary.
`.trim();

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: transcript },
  ];

  /* ▸ Call OpenAI */
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.2,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    console.error(await res.text());
    return NextResponse.json({ error: "LLM scoring failed" }, { status: 500 });
  }

  /* ▸ Parse LLM response */
  const { choices } = await res.json();
  try {
    const { scores, summary } = JSON.parse(choices[0].message.content);
    return NextResponse.json({ scores, summary });
  } catch (err) {
    console.error("Invalid JSON from LLM:", choices[0].message.content);
    return NextResponse.json({ error: "Invalid LLM output" }, { status: 500 });
  }
}

  // Use incoming list or fallback to your AI-Developer skills
  // const hs = Array.isArray(hardSkills) && hardSkills.length
  //   ? hardSkills
  //   : [
  //       "Gender and Sex",
  //       "Feminism",
  //       "Domestic Violence",
  //       "Masculinty",
  //       "Sustinable Development Goals",
  //     ]

 

// // app/api/analyze-transcript/route.ts
// import { NextResponse } from 'next/server'

// export async function POST(request: Request) {
//   const { transcript } = await request.json()

//   // 1. Build the messages for the LLM
//   const messages = [
//     {
//       role: 'system',
//       content: `
// You are an assistant that reads an interview transcript and scores the candidate on these dimensions (0–100):
// Soft skills: Communication, Teamwork, Attitude, Professionalism, Leadership, Creativity, Sociability
// Hard skills: Skill A, Skill B, Skill C, Skill D, Skill E

// Respond with only a JSON object, e.g.:
// {
//   "communication": 70,
//   "teamwork": 80,
//   "attitude": 75,
//   "professionalism": 65,
//   "leadership": 68,
//   "creativity": 72,
//   "sociability": 78,
//   "skillA": 80,
//   "skillB": 60,
//   "skillC": 100,
//   "skillD": 70,
//   "skillE": 80
// }
//       `.trim(),
//     },
//     {
//       role: 'user',
//       content: transcript,
//     },
//   ]

//   // 2. Call the OpenAI API
//   const response = await fetch('https://api.openai.com/v1/chat/completions', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
//     },
//     body: JSON.stringify({
//       model: 'gpt-4o-mini',   // or whichever model you prefer
//       messages,
//       temperature: 0.2,       // lower for more consistent scores
//       max_tokens: 200,
//     }),
//   })

//   if (!response.ok) {
//     console.error(await response.text())
//     return NextResponse.json({ error: 'LLM scoring failed' }, { status: 500 })
//   }

//   // 3. Parse and return
//   const { choices } = await response.json()
//   let scores: Record<string, number>
//   try {
//     scores = JSON.parse(choices[0].message.content)
//   } catch (e) {
//     console.error('Invalid JSON from LLM:', choices[0].message.content)
//     return NextResponse.json({ error: 'Invalid LLM output' }, { status: 500 })
//   }

//   return NextResponse.json(scores)
// }
