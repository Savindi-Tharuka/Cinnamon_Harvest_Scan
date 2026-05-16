import {
  AnalysisListResponse,
  AnalysisRecord,
  ListAnalysisParams,
  ThicknessEstimateResponse,
} from "../types";

const defaultHostedApiUrl = "http://10.156.160.59:5000";
const requestTimeoutMs = 20000;

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultHostedApiUrl
).replace(/\/$/, "");

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection and try again.");
    }
    throw new Error("Unable to connect to the server. Please check your internet.");
  } finally {
    clearTimeout(timeout);
  }
}

type ApiStemStatus = "unmatured" | "immatured" | "matured" | "overmatured" | "invalid";
type ApiAnalysisRecord = Omit<AnalysisRecord, "status"> & { status: ApiStemStatus };

function normalizeStatus(status: ApiStemStatus): AnalysisRecord["status"] {
  if (status === "unmatured") {
    return "immatured";
  }
  return status;
}

function normalizeRecord(record: ApiAnalysisRecord): AnalysisRecord {
  if (record.photo.url && record.photo.url.startsWith("http")) {
    return {
      ...record,
      status: normalizeStatus(record.status),
    };
  }

  const normalizedPhotoUrl = record.photo.path.startsWith("/")
    ? `${API_BASE_URL}${record.photo.path}`
    : `${API_BASE_URL}/${record.photo.path}`;

  return {
    ...record,
    status: normalizeStatus(record.status),
    photo: {
      ...record.photo,
      url: normalizedPhotoUrl,
    },
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "png") {
    return "image/png";
  }
  if (ext === "webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

export async function uploadStemImage(imageUri: string): Promise<AnalysisRecord> {
  const filename = imageUri.split("/").pop() ?? `stem-${Date.now()}.jpg`;
  const formData = new FormData();
  formData.append("image", {
    uri: imageUri,
    name: filename,
    type: getMimeType(filename),
  } as never);

  const response = await apiFetch("/api/v1/analyses/upload", {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json()) as { data: ApiAnalysisRecord };
  return normalizeRecord(payload.data);
}

export async function listAnalyses(
  params: ListAnalysisParams = {},
): Promise<AnalysisListResponse> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("per_page", String(params.perPage ?? 10));

  if (params.status) {
    query.set("status", params.status === "immatured" ? "unmatured" : params.status);
  }
  if (params.analyzedFrom) {
    query.set("analyzed_from", params.analyzedFrom);
  }
  if (params.analyzedTo) {
    query.set("analyzed_to", params.analyzedTo);
  }

  const response = await apiFetch(`/api/v1/analyses?${query.toString()}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json()) as Omit<AnalysisListResponse, "data"> & {
    data: ApiAnalysisRecord[];
  };
  return {
    ...payload,
    data: payload.data.map(normalizeRecord),
  };
}

export async function getAnalysisById(id: string): Promise<AnalysisRecord> {
  const response = await apiFetch(`/api/v1/analyses/${id}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json()) as { data: ApiAnalysisRecord };
  return normalizeRecord(payload.data);
}

export async function deleteAnalysisById(id: string): Promise<void> {
  const response = await apiFetch(`/api/v1/analyses/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }
}

export async function estimateMonthsByThickness(
  thicknessCm: number,
): Promise<ThicknessEstimateResponse> {
  const response = await apiFetch("/api/v1/analyses/estimate-months", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ thickness_cm: thicknessCm }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as ThicknessEstimateResponse;
}
