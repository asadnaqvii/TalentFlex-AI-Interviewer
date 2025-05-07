import { NextRequest, NextResponse } from "next/server";
import prompts from "@/data/prompt_catalogue.json";

export async function GET(_req: NextRequest) {
  return NextResponse.json(prompts);
}
