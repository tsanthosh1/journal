import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { getFitnessProfile, saveFitnessProfile } from "@/lib/fitness/profileStorage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const targetUserId =
      searchParams.get("userId") || verifiedUser.email || verifiedUser.primaryUserId || verifiedUser.uid;

    const profile = await getFitnessProfile(targetUserId);

    return NextResponse.json({
      profile: profile || {
        userId: targetUserId,
        heightCm: null,
        heightUnit: "cm",
        targetWeightKg: null,
        currentWeightKg: null,
        bmi: null,
      },
    });
  } catch (error: any) {
    console.error("Failed to get fitness profile:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch profile" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const targetUserId =
      body.userId || verifiedUser.email || verifiedUser.primaryUserId || verifiedUser.uid;

    const heightCm = body.heightCm !== undefined ? parseFloat(body.heightCm) : undefined;
    const heightUnit = body.heightUnit;
    const targetWeightKg =
      body.targetWeightKg !== undefined ? parseFloat(body.targetWeightKg) : undefined;
    const startingWeightKg =
      body.startingWeightKg !== undefined ? parseFloat(body.startingWeightKg) : undefined;

    const updated = await saveFitnessProfile(targetUserId, {
      heightCm: isNaN(heightCm as number) ? undefined : heightCm,
      heightUnit,
      targetWeightKg: isNaN(targetWeightKg as number) ? undefined : targetWeightKg,
      startingWeightKg: isNaN(startingWeightKg as number) ? undefined : startingWeightKg,
    });

    return NextResponse.json({
      success: true,
      profile: updated,
      message: "Fitness profile updated successfully",
    });
  } catch (error: any) {
    console.error("Failed to update fitness profile:", error);
    return NextResponse.json({ error: error.message || "Failed to update profile" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  return POST(request);
}
