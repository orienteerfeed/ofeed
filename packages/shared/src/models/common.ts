import { z } from "zod";

export const dateLikeSchema = z.union([z.string(), z.date()]);

export const sexSchema = z.enum(["B", "M", "F"]);
export const classStatusSchema = z.enum([
  "NORMAL",
  "DIVIDED",
  "JOINED",
  "INVALIDATED",
  "INVALIDATEDNOFEE",
]);
export const resultStatusSchema = z.enum([
  "OK",
  "Finished",
  "MissingPunch",
  "Disqualified",
  "DidNotFinish",
  "Active",
  "Inactive",
  "OverTime",
  "SportingWithdrawal",
  "NotCompeting",
  "Moved",
  "MovedUp",
  "DidNotStart",
  "DidNotEnter",
  "Cancelled",
]);
export const originSchema = z.enum(["START", "OFFICE", "FINISH", "IT"]);
export const protocolTypeSchema = z.enum([
  "competitor_create",
  "competitor_update",
  "class_change",
  "firstname_change",
  "lastname_change",
  "bibNumber_change",
  "nationality_change",
  "registration_change",
  "license_change",
  "ranking_change",
  "rank_points_avg_change",
  "organisation_change",
  "short_name_change",
  "si_card_change",
  "start_time_change",
  "finish_time_change",
  "time_change",
  "team_change",
  "leg_change",
  "status_change",
  "late_start_change",
  "note_change",
  "external_id_change",
]);
export const startModeSchema = z.enum([
  "Individual",
  "Mass",
  "Handicap",
  "Pursuit",
  "Wave",
  "ScoreO",
]);
export const eventFilterSchema = z.enum(["ALL", "TODAY", "UPCOMING", "RECENT"]);

export type Sex = z.infer<typeof sexSchema>;
export type ClassStatus = z.infer<typeof classStatusSchema>;
export type ResultStatus = z.infer<typeof resultStatusSchema>;
export type Origin = z.infer<typeof originSchema>;
export type ProtocolType = z.infer<typeof protocolTypeSchema>;
export type StartMode = z.infer<typeof startModeSchema>;
export type EventFilter = z.infer<typeof eventFilterSchema>;
