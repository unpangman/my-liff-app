// LINE LIFF Conference Room Reservation App (React + Tailwind + shadcn/ui)
// -----------------------------------------------------------------------
// How to use:
// 1) Create a LIFF app in LINE Developers Console and get your LIFF ID.
// 2) Host this page (Vite/Next/Netlify/GitHub Pages). For local dev, the preview will run without real LIFF.
// 3) Replace LIFF_ID below. When deployed under your LIFF URL, it will run inside LINE.
// 4) (Optional) Set WEBHOOK_URL to your backend (Google Apps Script Web App, Firebase, etc.).
// 5) Open via liff://app/<LIFF_ID> or share as a LIFF URL in a chat or rich menu.
//
// Notes:
// - Works in "mock mode" when LINE LIFF SDK is unavailable (e.g., local preview). It still validates and stores
//   bookings in localStorage for testing. Inside LINE, it will try liff.sendMessages and liff.closeWindow().
// - Timezone defaults to the browser; adjust as needed.

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Calendar, Clock, Building2, User, DoorOpen } from "lucide-react";

const LIFF_ID = import.meta.env.VITE_LIFF_ID || "2007984710-yGL8EkbY";
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || ""; // e.g., your Google Apps Script endpoint

function useLiff() {
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState(null);
  const [inClient, setInClient] = useState(false);

  useEffect(() => {
    async function init() {
      const hasLiff = typeof window !== "undefined" && !!window.liff;
      if (!hasLiff) {
        // Mock mode for local preview / non-LINE browsers
        setIsReady(true);
        setIsLoggedIn(false);
        setInClient(false);
        setProfile(null);
        return;
      }
      try {
        if (!LIFF_ID || LIFF_ID.includes("REPLACE")) {
          console.warn("LIFF_ID is not set. Running in mock mode.");
          setIsReady(true);
          return;
        }
        await window.liff.init({ liffId: LIFF_ID });
        setInClient(window.liff.isInClient());
        if (!window.liff.isLoggedIn()) {
          window.liff.login();
          return; // login will redirect
        }
        setIsLoggedIn(true);
        const p = await window.liff.getProfile();
        setProfile(p);
        setIsReady(true);
      } catch (e) {
        console.error("LIFF init error", e);
        setIsReady(true);
      }
    }
    init();
  }, []);

  return { isReady, isLoggedIn, profile, inClient };
}

const rooms = [
  { id: "CR-101", name: "Room 101 (4 ppl)" },
  { id: "CR-202", name: "Room 202 (8 ppl)" },
  { id: "CR-Aud", name: "Auditorium (30 ppl)" },
  { id: "CR-Meet", name: "Meeting Pod (2 ppl)" },
];

const timeslots = [
  "09:00-10:00",
  "10:00-11:00",
  "11:00-12:00",
  "13:00-14:00",
  "14:00-15:00",
  "15:00-16:00",
  "16:00-17:00",
];

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function saveBookingLocal(b) {
  const key = "liff_room_bookings";
  const raw = localStorage.getItem(key);
  const arr = raw ? JSON.parse(raw) : [];
  arr.push(b);
  localStorage.setItem(key, JSON.stringify(arr));
}

function getBookingsLocal() {
  const key = "liff_room_bookings";
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

export default function LiffConferenceRoomApp() {
  const { isReady, isLoggedIn, profile, inClient } = useLiff();

  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [dayToUse, setDayToUse] = useState(todayISO());
  const [timeSlot, setTimeSlot] = useState(timeslots[0]);
  const [roomId, setRoomId] = useState(rooms[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (profile && !name) setName(profile.displayName || "");
  }, [profile]);

  const bookingsToday = useMemo(() => {
    return getBookingsLocal().filter((b) => b.dayToUse === dayToUse);
  }, [dayToUse, submitting]);

  async function sendToWebhook(payload) {
    if (!WEBHOOK_URL) return { ok: false, message: "No WEBHOOK_URL set (skipping)" };
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      return { ok: true };
    } catch (e) {
      console.error(e);
      return { ok: false, message: String(e) };
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setToast("");

    // Simple validations
    if (!name.trim() || !department.trim()) {
      setToast("Please fill in Name and Department.");
      return;
    }

    const booking = {
      name: name.trim(),
      department: department.trim(),
      dayToUse,
      timeSlot,
      roomId,
      createdAt: new Date().toISOString(),
      userId: profile?.userId || null,
    };

    setSubmitting(true);

    // Save locally for preview/testing
    saveBookingLocal(booking);

    // Try webhook (optional)
    const webhookRes = await sendToWebhook({ action: "createBooking", data: booking });

    // Try LIFF message (inside LINE)
    const hasLiff = typeof window !== "undefined" && !!window.liff && LIFF_ID && !LIFF_ID.includes("REPLACE");
    if (hasLiff && window.liff.isLoggedIn()) {
      try {
        await window.liff.sendMessages([
          {
            type: "text",
            text: `📌 Room Booking\n👤 ${booking.name} (${booking.department})\n🏢 Room: ${rooms.find(r=>r.id===roomId)?.name || roomId}\n🗓️ Date: ${booking.dayToUse}\n⏰ Time: ${booking.timeSlot}`,
          },
        ]);
      } catch (e) {
        console.warn("sendMessages failed", e);
      }
    }

    setSubmitting(false);
    setToast(
      webhookRes.ok
        ? "Booking submitted!"
        : `Saved locally. ${hasLiff ? "Sent LINE message. " : ""}Webhook skipped/failed.`
    );

    // Close LIFF window after a short delay (if inside LINE)
    if (hasLiff && window.liff.isInClient()) {
      setTimeout(() => {
        try { window.liff.closeWindow(); } catch {}
      }, 600);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-2xl"
      >
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Conference Room Reservation</h1>
          <p className="text-slate-500 text-sm">Fill in your details and book a room.</p>
        </div>

        {/* Status / Profile */}
        <div className="mb-4 text-center text-xs text-slate-500">
          {isReady ? (
            <>
              {profile ? (
                <span>Signed in as <b>{profile.displayName}</b></span>
              ) : (
                <span>Preview mode — LIFF not detected</span>
              )}
            </>
          ) : (
            <span>Initializing…</span>
          )}
        </div>

        <Card className="shadow-sm rounded-2xl">
          <CardContent className="p-6 space-y-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div className="grid gap-2">
                <Label htmlFor="name" className="flex items-center gap-2"><User className="w-4 h-4"/>Name</Label>
                <Input id="name" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" required />
              </div>

              {/* Department */}
              <div className="grid gap-2">
                <Label htmlFor="dept" className="flex items-center gap-2"><Building2 className="w-4 h-4"/>Department</Label>
                <Input id="dept" value={department} onChange={(e)=>setDepartment(e.target.value)} placeholder="e.g., IT, HR" required />
              </div>

              {/* Date */}
              <div className="grid gap-2">
                <Label htmlFor="date" className="flex items-center gap-2"><Calendar className="w-4 h-4"/>Day to Use</Label>
                <Input id="date" type="date" value={dayToUse} min={todayISO()} onChange={(e)=>setDayToUse(e.target.value)} required />
              </div>

              {/* Time Slot */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-2"><Clock className="w-4 h-4"/>Time Slot</Label>
                <Select value={timeSlot} onValueChange={setTimeSlot}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeslots.map(ts => (
                      <SelectItem key={ts} value={ts}>{ts}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Room */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-2"><DoorOpen className="w-4 h-4"/>Room</Label>
                <Select value={roomId} onValueChange={setRoomId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a room" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Submitting…" : "Reserve Room"}
              </Button>

              {toast && (
                <div className="text-center text-sm text-emerald-600">{toast}</div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Simple Local Preview of Bookings for selected date */}
        <div className="mt-6">
          <h2 className="text-sm font-medium text-slate-700 mb-2">Bookings on {dayToUse}</h2>
          <div className="grid gap-2">
            {bookingsToday.length === 0 ? (
              <div className="text-xs text-slate-500">No bookings yet.</div>
            ) : (
              bookingsToday.map((b, i) => (
                <div key={i} className="text-xs p-3 rounded-xl border bg-white flex items-center justify-between">
                  <div>
                    <div className="font-medium">{rooms.find(r=>r.id===b.roomId)?.name || b.roomId} • {b.timeSlot}</div>
                    <div className="text-slate-500">{b.name} ({b.department})</div>
                  </div>
                  <div className="text-slate-400">{new Date(b.createdAt).toLocaleTimeString()}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Helper Links */}
        <div className="mt-8 text-center text-xs text-slate-500">
          <p>
            {LIFF_ID && !LIFF_ID.includes("REPLACE") ? (
              <a className="underline" href={`https://liff.line.me/${LIFF_ID}`}>Open in LINE</a>
            ) : (
              <>
                Set <code className="px-1 bg-slate-100 rounded">VITE_LIFF_ID</code> to enable LIFF.
              </>
            )}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
