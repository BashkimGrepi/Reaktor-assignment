// In this file we call the legacy API to fetch the history of games
// we do not normalize the response to any format here

import { fetchWithToken } from "../utils/fetchWithToken.js";
import { LegacyGame } from "../types/rps-dto.js";

type HistoryResponse = {
    data: LegacyGame[];
    cursor?: string | null;
}

export const fetchHistoryPage = async (cursorUrl?: string | null): Promise<HistoryResponse> => {
    //const url = `${process.env.LEGACY_API_BASE_URL}/history`;
    //const url = `${https://assignments.reaktor.com/history}/${cursorUrl || ""}`;
    const url = cursorUrl? `https://assignments.reaktor.com${cursorUrl}`: "https://assignments.reaktor.com/history";

    const response = await fetchWithToken(url);
    const json = await response.json() as HistoryResponse;

    return {
        data: json.data,
        cursor: json.cursor || null
    };
};