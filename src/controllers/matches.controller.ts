import { Request, Response } from "express";
import {
  getLatestMatches,
  getMatchesByPlayer,
  getPlayerStats,
  getMatchesByDay,
  getMatchesByDateAndPlayer,
} from "../services/matches.service.js";

// GET /api/matches
// Optional query params:
// - date=YYYY-MM-DD (UTC day)
// - playerName=string (case-insensitive match)
// If no query params, return latest matches (up to 100)
export async function getMatchesController(req: Request, res: Response) {
  try {
    const { date, playerName } = req.query;

    const dateStr = typeof date === "string" ? date : undefined;
    const playerNameStr =
      typeof playerName === "string" ? playerName : undefined;

    // Both filters
    if (dateStr && playerNameStr) {
      const matches = await getMatchesByDateAndPlayer(dateStr, playerNameStr);
      const stats = await getPlayerStats(playerNameStr);

      return res.json({
        data: matches,
        count: matches.length,
        playerStats: {
          player: playerNameStr,
          ...stats,
        },
      });
    }

    // Date only
    if (dateStr) {
      const matches = await getMatchesByDay(dateStr);
      return res.json({ data: matches, count: matches.length });
    }

    // Player only
    if (playerNameStr) {
      const matches = await getMatchesByPlayer(playerNameStr);
      const stats = await getPlayerStats(playerNameStr);
      return res.json({
        data: matches,
        count: matches.length,
        playerStats: {
          player: playerNameStr,
          ...stats,
        },
      });
    }

    // Neither - return latest matches
    const matches = await getLatestMatches(100);
    res.json({ data: matches, count: matches.length });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
}
