export type StemStatus = "immatured" | "matured" | "overmatured" | "invalid";
export type CaptureSource = "camera" | "library";

export interface AnalysisPhoto {
  filename: string;
  path: string;
  url: string;
}

export interface AnalysisRecord {
  id: string;
  status: StemStatus;
  confidence: number;
  time_required_to_mature_days: number | null;
  time_required_to_mature_range?: string | null;
  analyzed_at: string;
  thickness?: number;
  photo: AnalysisPhoto;
}

export interface AnalysisListResponse {
  data: AnalysisRecord[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface ListAnalysisParams {
  page?: number;
  perPage?: number;
  status?: StemStatus;
  analyzedFrom?: string;
  analyzedTo?: string;
}

export interface ThicknessEstimateResponse {
  thickness_cm: number;
  normalized_width: number;
  width_category: "thin" | "medium" | "thick" | "invalid";
  months: string;
  confidence: number;
  status: "ok";
}
