import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { getAllActivitySchemas, getActivitySchema, evolveActivitySchema } from "@/lib/timeline/storage";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const activityType = searchParams.get("activityType");

    if (activityType) {
      const schema = await getActivitySchema(activityType);
      return NextResponse.json({ success: true, schema });
    }

    const schemas = await getAllActivitySchemas();
    return NextResponse.json({
      success: true,
      schemas,
      types: Object.keys(schemas),
    });
  } catch (error: any) {
    console.error("GET /api/timeline/schemas error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch schemas" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const activityType = body.activityType?.toUpperCase();

    if (!activityType) {
      return NextResponse.json({ error: "activityType is required" }, { status: 400 });
    }

    // If new fields are being added/evolved
    if (Array.isArray(body.newFields) && body.newFields.length > 0) {
      const evolved = await evolveActivitySchema(activityType, body.newFields);
      return NextResponse.json({ success: true, schema: evolved });
    }

    // Direct full schema save/update
    const { db } = getFirebaseAdmin();
    const now = new Date().toISOString();
    const current = await getActivitySchema(activityType);

    const schemaToSave = {
      ...current,
      ...body,
      activityType,
      version: (current.version || 1) + 1,
      updatedAt: now,
    };

    await db.collection("event_schemas").doc(activityType).set(schemaToSave, { merge: true });

    return NextResponse.json({
      success: true,
      schema: schemaToSave,
    });
  } catch (error: any) {
    console.error("POST /api/timeline/schemas error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update schema" },
      { status: 500 }
    );
  }
}
