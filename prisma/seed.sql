-- Seed: FIFA World Cup 2026 Tournament + Groups
INSERT INTO "Tournament" (id, name, year, host, "groupStageStart", "groupStageEnd", "knockoutStageStart", "totalTeams", "totalGroups", "createdAt")
VALUES ('clwc2026tournamentid0001','FIFA World Cup 2026',2026,'USA / Canada / Mexico','2026-06-11 18:00:00','2026-06-27 21:00:00','2026-07-01 18:00:00',48,12,NOW()) ON CONFLICT (year) DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026groupa0001', 'clwc2026tournamentid0001', 'A') ON CONFLICT DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026groupb0001', 'clwc2026tournamentid0001', 'B') ON CONFLICT DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026groupc0001', 'clwc2026tournamentid0001', 'C') ON CONFLICT DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026groupd0001', 'clwc2026tournamentid0001', 'D') ON CONFLICT DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026groupe0001', 'clwc2026tournamentid0001', 'E') ON CONFLICT DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026groupf0001', 'clwc2026tournamentid0001', 'F') ON CONFLICT DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026groupg0001', 'clwc2026tournamentid0001', 'G') ON CONFLICT DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026grouph0001', 'clwc2026tournamentid0001', 'H') ON CONFLICT DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026groupi0001', 'clwc2026tournamentid0001', 'I') ON CONFLICT DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026groupj0001', 'clwc2026tournamentid0001', 'J') ON CONFLICT DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026groupk0001', 'clwc2026tournamentid0001', 'K') ON CONFLICT DO NOTHING;
INSERT INTO "TournamentGroup" (id, "tournamentId", letter) VALUES ('clwc2026groupl0001', 'clwc2026tournamentid0001', 'L') ON CONFLICT DO NOTHING;