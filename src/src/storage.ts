import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { resolve, dirname } from "path";
import type {
  AssetRecord,
  SensorReading,
  WeatherForecast,
  IncidentRecord,
  MaintenancePlan,
} from "./types.js";

export interface SerializedGridStore {
  version: string;
  last_saved: string;
  assets: Record<string, AssetRecord>;
  latest_readings: Record<string, SensorReading>;
  weather_forecasts: Record<string, WeatherForecast>;
  incidents: Record<string, IncidentRecord[]>;
  latest_plan: MaintenancePlan | null;
}

export class GridStore {
  private filePath: string;
  private memoryData: SerializedGridStore;

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = resolve(customPath);
    } else {
      // Default to data/grid_store.json relative to project root
      const baseDir = process.env.GRID_DATA_DIR || resolve(process.cwd(), "data");
      this.filePath = resolve(baseDir, "grid_store.json");
    }

    this.memoryData = {
      version: "1.0.0",
      last_saved: new Date().toISOString(),
      assets: {},
      latest_readings: {},
      weather_forecasts: {},
      incidents: {},
      latest_plan: null,
    };

    this.load();
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public load(): void {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<SerializedGridStore>;
        this.memoryData = {
          version: parsed.version || "1.0.0",
          last_saved: parsed.last_saved || new Date().toISOString(),
          assets: parsed.assets || {},
          latest_readings: parsed.latest_readings || {},
          weather_forecasts: parsed.weather_forecasts || {},
          incidents: parsed.incidents || {},
          latest_plan: parsed.latest_plan || null,
        };
      }
    } catch (err) {
      console.error(`[GridStore] Warning: could not load existing store from ${this.filePath}, starting fresh:`, err);
    }
  }

  public save(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      this.memoryData.last_saved = new Date().toISOString();
      const payload = JSON.stringify(this.memoryData, null, 2);

      // Atomic write: write to temp file then rename
      const tempPath = `${this.filePath}.tmp.${Date.now()}`;
      writeFileSync(tempPath, payload, "utf-8");
      renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error(`[GridStore] Failed to persist data to ${this.filePath}:`, err);
    }
  }

  // ── Asset Management ────────────────────────────────────────────────────────

  public getAssets(): AssetRecord[] {
    return Object.values(this.memoryData.assets);
  }

  public getAsset(assetId: string): AssetRecord | undefined {
    return this.memoryData.assets[assetId];
  }

  public setAsset(asset: AssetRecord): void {
    this.memoryData.assets[asset.asset_id] = asset;
    this.save();
  }

  public deleteAsset(assetId: string): boolean {
    if (this.memoryData.assets[assetId]) {
      delete this.memoryData.assets[assetId];
      delete this.memoryData.latest_readings[assetId];
      delete this.memoryData.incidents[assetId];
      this.save();
      return true;
    }
    return false;
  }

  public hasAsset(assetId: string): boolean {
    return Boolean(this.memoryData.assets[assetId]);
  }

  // ── Telemetry & Sensor Readings ─────────────────────────────────────────────

  public getReading(assetId: string): SensorReading | undefined {
    return this.memoryData.latest_readings[assetId];
  }

  public getAllReadings(): Record<string, SensorReading> {
    return { ...this.memoryData.latest_readings };
  }

  public setReading(reading: SensorReading, skipSave: boolean = false): void {
    this.memoryData.latest_readings[reading.asset_id] = reading;
    if (!skipSave) this.save();
  }

  public setReadings(readings: SensorReading[], skipSave: boolean = false): void {
    for (const r of readings) {
      this.memoryData.latest_readings[r.asset_id] = r;
    }
    if (!skipSave) this.save();
  }

  // ── Weather Forecasts ───────────────────────────────────────────────────────

  public getWeather(region: string): WeatherForecast | undefined {
    return this.memoryData.weather_forecasts[region];
  }

  public getAllWeather(): WeatherForecast[] {
    return Object.values(this.memoryData.weather_forecasts);
  }

  public setWeather(forecast: WeatherForecast): void {
    this.memoryData.weather_forecasts[forecast.region] = forecast;
    this.save();
  }

  // ── Incidents ───────────────────────────────────────────────────────────────

  public getIncidents(assetId: string): IncidentRecord[] {
    return this.memoryData.incidents[assetId] || [];
  }

  public getAllIncidents(): IncidentRecord[] {
    return Object.values(this.memoryData.incidents).flat();
  }

  public addIncident(incident: IncidentRecord): void {
    const list = this.memoryData.incidents[incident.asset_id] || [];
    list.push(incident);
    this.memoryData.incidents[incident.asset_id] = list;
    this.save();
  }

  // ── Plans ───────────────────────────────────────────────────────────────────

  public getLatestPlan(): MaintenancePlan | null {
    return this.memoryData.latest_plan;
  }

  public setLatestPlan(plan: MaintenancePlan): void {
    this.memoryData.latest_plan = plan;
    this.save();
  }

  // ── Snapshot & Reset ────────────────────────────────────────────────────────

  public getSnapshot(): SerializedGridStore {
    return JSON.parse(JSON.stringify(this.memoryData));
  }

  public restoreSnapshot(snapshot: SerializedGridStore): void {
    this.memoryData = JSON.parse(JSON.stringify(snapshot));
    this.save();
  }

  public reset(): void {
    this.memoryData = {
      version: "1.0.0",
      last_saved: new Date().toISOString(),
      assets: {},
      latest_readings: {},
      weather_forecasts: {},
      incidents: {},
      latest_plan: null,
    };
    this.save();
  }
}
