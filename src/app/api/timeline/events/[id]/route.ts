import { NextRequest, NextResponse } from "next/server";
import { updateLifeEvent, deleteLifeEvent, getLifeEventById } from "@/lib/timeline/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const event = await getLifeEventById(id);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, event });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch event" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await updateLifeEvent(id, body);

    if (!updated) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, event: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update event" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteLifeEvent(id);
    return NextResponse.json({ success: true, message: "Event deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete event" }, { status: 500 });
  }
}
