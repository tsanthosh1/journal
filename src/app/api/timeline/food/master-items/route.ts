import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { getMasterFoodItems, saveOrUpdateMasterFoodItem } from "@/lib/timeline/foodMasterStorage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const queryUserId = searchParams.get("userId");
    const authUserId = verifiedUser.email || verifiedUser.primaryUserId;
    const userId = (queryUserId && queryUserId !== "default_user") ? queryUserId : authUserId;

    const items = await getMasterFoodItems(userId);
    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    console.error("GET /api/timeline/food/master-items error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch master food items" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { name, defaultAnchor, defaultOccasion, defaultCalories, category } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Food item name is required" }, { status: 400 });
    }

    const authUserId = verifiedUser.email || verifiedUser.primaryUserId;
    const userId = (body.userId && body.userId !== "default_user") ? body.userId : authUserId;

    const saved = await saveOrUpdateMasterFoodItem(userId, {
      name: name.trim(),
      defaultAnchor,
      defaultOccasion,
      defaultCalories: defaultCalories ? Number(defaultCalories) : undefined,
      category,
    });

    return NextResponse.json({ success: true, item: saved });
  } catch (error: any) {
    console.error("POST /api/timeline/food/master-items error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save master food item" },
      { status: 500 }
    );
  }
}
