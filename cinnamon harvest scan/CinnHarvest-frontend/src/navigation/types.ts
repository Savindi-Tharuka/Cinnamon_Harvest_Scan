import { AnalysisRecord, CaptureSource } from "../types";

export type RootStackParamList = {
  Home: undefined;
  Tools: undefined;
  Tips: undefined;
  History: undefined;
  ThicknessEstimator: undefined;
  ScanCamera: undefined;
  CropImage: {
    imageUri: string;
    source: CaptureSource;
  };
  PhotoPreview: {
    imageUri: string;
    source: CaptureSource;
  };
  Result: {
    mode: "new" | "history";
    imageUri?: string;
    source?: CaptureSource;
    record?: AnalysisRecord;
    recordId?: string;
  };
};
