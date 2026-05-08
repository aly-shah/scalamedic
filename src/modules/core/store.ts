"use client";

// ============================================================
// MediCore ERP — Cross-Module Reactive State Store
// Zustand store that event handlers update, UI components subscribe to.
// ============================================================

import { create } from "zustand";
import type { WorkflowStage } from "@/types";

// ---- Activity Feed Item ----
export interface ActivityItem {
  id: string;
  event: string;
  message: string;
  moduleId: string;
  patientId?: string;
  appointmentId?: string;
  timestamp: number;
}

// ---- Waiting Queue Entry ----
export interface QueueEntry {
  appointmentId: string;
  patientId: string;
  patientName: string;
  doctorName: string;
  checkinTime: number;
  stage: WorkflowStage;
}

// ---- Notification Badge ----
export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  moduleId: string;
  isRead: boolean;
  timestamp: number;
  link?: string;
}

// ---- Store Shape ----
interface ModuleStoreState {
  // Activity feed (recent cross-module events)
  activities: ActivityItem[];
  addActivity: (item: Omit<ActivityItem, "id" | "timestamp">) => void;

  // Notification badges
  notifications: NotificationItem[];
  unreadCount: number;
  addNotification: (item: Omit<NotificationItem, "id" | "timestamp" | "isRead">) => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;

  // Waiting queue (live during the day)
  waitingQueue: QueueEntry[];
  addToQueue: (entry: QueueEntry) => void;
  removeFromQueue: (appointmentId: string) => void;
  updateQueueStage: (appointmentId: string, stage: WorkflowStage) => void;

  // Patient journey tracker (active visit per patient)
  activeVisits: Map<string, { appointmentId: string; stage: WorkflowStage; startedAt: number }>;
  startVisit: (patientId: string, appointmentId: string) => void;
  advanceVisit: (patientId: string, stage: WorkflowStage) => void;
  endVisit: (patientId: string) => void;

  // Module-level counters (for dashboard badges)
  counters: Record<string, number>;
  setCounter: (key: string, value: number) => void;
  incrementCounter: (key: string) => void;
  decrementCounter: (key: string) => void;
}

let activitySeq = 0;
let notifSeq = 0;

export const useModuleStore = create<ModuleStoreState>((set) => ({
  // ---- Activities ----
  activities: [],
  addActivity: (item) =>
    set((s) => ({
      activities: [
        { ...item, id: `act-${++activitySeq}`, timestamp: Date.now() },
        ...s.activities,
      ].slice(0, 100),
    })),

  // ---- Notifications ----
  notifications: [],
  unreadCount: 0,
  addNotification: (item) =>
    set((s) => {
      const notif: NotificationItem = {
        ...item,
        id: `notif-${++notifSeq}`,
        timestamp: Date.now(),
        isRead: false,
      };
      return {
        notifications: [notif, ...s.notifications].slice(0, 200),
        unreadCount: s.unreadCount + 1,
      };
    }),
  markNotificationRead: (id) =>
    set((s) => {
      const updated = s.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      );
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.isRead).length,
      };
    }),
  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })),

  // ---- Waiting Queue ----
  waitingQueue: [],
  addToQueue: (entry) =>
    set((s) => ({
      waitingQueue: [...s.waitingQueue, entry],
    })),
  removeFromQueue: (appointmentId) =>
    set((s) => ({
      waitingQueue: s.waitingQueue.filter((e) => e.appointmentId !== appointmentId),
    })),
  updateQueueStage: (appointmentId, stage) =>
    set((s) => ({
      waitingQueue: s.waitingQueue.map((e) =>
        e.appointmentId === appointmentId ? { ...e, stage } : e
      ),
    })),

  // ---- Active Visits ----
  activeVisits: new Map(),
  startVisit: (patientId, appointmentId) =>
    set((s) => {
      const visits = new Map(s.activeVisits);
      visits.set(patientId, {
        appointmentId,
        stage: "CHECKIN" as WorkflowStage,
        startedAt: Date.now(),
      });
      return { activeVisits: visits };
    }),
  advanceVisit: (patientId, stage) =>
    set((s) => {
      const visits = new Map(s.activeVisits);
      const existing = visits.get(patientId);
      if (existing) visits.set(patientId, { ...existing, stage });
      return { activeVisits: visits };
    }),
  endVisit: (patientId) =>
    set((s) => {
      const visits = new Map(s.activeVisits);
      visits.delete(patientId);
      return { activeVisits: visits };
    }),

  // ---- Counters ----
  counters: {},
  setCounter: (key, value) =>
    set((s) => ({ counters: { ...s.counters, [key]: value } })),
  incrementCounter: (key) =>
    set((s) => ({ counters: { ...s.counters, [key]: (s.counters[key] || 0) + 1 } })),
  decrementCounter: (key) =>
    set((s) => ({ counters: { ...s.counters, [key]: Math.max(0, (s.counters[key] || 0) - 1) } })),
}));
