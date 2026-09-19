import { GridStore } from "./storage.js";
import type { SensorReading } from "./types.js";

export type WeatherPreset = "NORMAL" | "HEAT_WAVE" | "HEAVY_RAIN" | "THUNDERSTORM" | "EXTREME_STORM";

export interface SimulatorWeather {
  temperature: number;
  windSpeed: number;
  rainfall: number;
  lightningRisk: number;
  stormSeverity: number;
}

const PRESETS: Record<WeatherPreset, SimulatorWeather> = {
  NORMAL: { temperature: 22, windSpeed: 10, rainfall: 0, lightningRisk: 0, stormSeverity: 0 },
  HEAT_WAVE: { temperature: 42, windSpeed: 15, rainfall: 0, lightningRisk: 10, stormSeverity: 1 },
  HEAVY_RAIN: { temperature: 18, windSpeed: 40, rainfall: 45, lightningRisk: 20, stormSeverity: 2 },
  THUNDERSTORM: { temperature: 24, windSpeed: 65, rainfall: 30, lightningRisk: 85, stormSeverity: 3 },
  EXTREME_STORM: { temperature: 28, windSpeed: 120, rainfall: 80, lightningRisk: 95, stormSeverity: 4 }
};

export class TelemetrySimulator {
  private store: GridStore;
  private intervalId: NodeJS.Timeout | null = null;
  public isRunning: boolean = false;
  
  public currentPreset: WeatherPreset = "NORMAL";
  public currentWeather: SimulatorWeather = { ...PRESETS.NORMAL };
  public lastUpdate: string = "";
  
  private targetAssets = ["T-101", "T-102", "T-103", "T-104"];

  // Baselines to revert to during normal weather
  private baselines: Record<string, Partial<SensorReading>> = {
    "T-101": { temperature_c: 65, vibration_mm_s: 2.1, partial_discharge_pC: 15, load_percent: 60, voltage_v: 230000, current_a: 200, oil_quality_index: 95 },
    "T-102": { temperature_c: 70, vibration_mm_s: 3.5, partial_discharge_pC: 45, load_percent: 75, voltage_v: 115000, current_a: 350, oil_quality_index: 80 },
    "T-103": { temperature_c: 85, vibration_mm_s: 5.2, partial_discharge_pC: 120, load_percent: 90, voltage_v: 500000, current_a: 600, oil_quality_index: 60 },
    "T-104": { temperature_c: 60, vibration_mm_s: 1.8, partial_discharge_pC: 5, load_percent: 45, voltage_v: 33000, current_a: 100, oil_quality_index: 98 }
  };

  constructor(store: GridStore) {
    this.store = store;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.tick(), 2500);
    console.log("[Simulator] Started live telemetry simulation for assets:", this.targetAssets);
  }

  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    console.log("[Simulator] Stopped live telemetry simulation.");
  }

  public setPreset(preset: WeatherPreset) {
    if (PRESETS[preset]) {
      this.currentPreset = preset;
      this.currentWeather = { ...PRESETS[preset] };
      console.log(`[Simulator] Weather preset changed to ${preset}`);
    }
  }

  public updateWeather(customWeather: Partial<SimulatorWeather>) {
    this.currentPreset = "NORMAL";
    this.currentWeather = { ...this.currentWeather, ...customWeather };
    console.log(`[Simulator] Weather updated manually`, customWeather);
  }

  private tick() {
    this.lastUpdate = new Date().toISOString();
    
    const readings = this.store.getAllReadings();
    const updatedReadings: SensorReading[] = [];

    for (const assetId of this.targetAssets) {
      const existing = readings[assetId];
      if (!existing) continue;

      const baseline = this.baselines[assetId];
      if (!baseline) continue;

      // Noise generator
      const noise = (scale: number) => (Math.random() - 0.5) * scale;
      
      const tempInfluence = (this.currentWeather.temperature - 22) * 0.5;
      const stormInfluence = this.currentWeather.stormSeverity * 1.5;
      
      const approach = (current: number, target: number, step: number) => {
        if (current < target) return Math.min(current + step, target);
        if (current > target) return Math.max(current - step, target);
        return current;
      };

      let targetTemp = (baseline.temperature_c || 60) + tempInfluence + (existing.load_percent / 100) * 10;
      let targetVib = (baseline.vibration_mm_s || 2) + stormInfluence;
      let targetPd = (baseline.partial_discharge_pC || 10) * (1 + stormInfluence * 0.5) + (this.currentWeather.lightningRisk * 0.5);
      let targetLoad = (baseline.load_percent || 50) + (this.currentWeather.temperature > 30 ? 15 : 0) + noise(5);
      
      let voltageFluctuation = this.currentWeather.lightningRisk > 50 ? noise((baseline.voltage_v || 230000) * 0.05) : noise((baseline.voltage_v || 230000) * 0.005);
      let currentFluctuation = stormInfluence > 0 ? noise((baseline.current_a || 100) * 0.1) : noise((baseline.current_a || 100) * 0.02);

      const targetVoltage = (baseline.voltage_v || 230000) + voltageFluctuation;
      const targetCurrent = (baseline.current_a || 100) * (targetLoad / (baseline.load_percent || 50)) + currentFluctuation;
      
      let currentOil = existing.oil_quality_index;
      if (this.currentWeather.temperature > 35) currentOil -= 0.01;
      
      const newTemp = approach(existing.temperature_c, targetTemp, 2.0) + noise(0.5);
      const newVib = approach(existing.vibration_mm_s, targetVib, 0.5) + noise(0.2);
      const newPd = approach(existing.partial_discharge_pC, targetPd, 5.0) + noise(2);
      const newLoad = approach(existing.load_percent, targetLoad, 2.0) + noise(1);
      
      const boundedTemp = Math.max(10, Math.min(150, newTemp));
      const boundedVib = Math.max(0, Math.min(15, newVib));
      const boundedPd = Math.max(0, newPd);
      const boundedLoad = Math.max(0, Math.min(150, newLoad));
      const boundedOil = Math.max(0, currentOil);
      const boundedVoltage = Math.max(0, targetVoltage);
      const boundedCurrent = Math.max(0, targetCurrent);

      updatedReadings.push({
        ...existing,
        timestamp: this.lastUpdate,
        temperature_c: Math.round(boundedTemp * 10) / 10,
        vibration_mm_s: Math.round(boundedVib * 10) / 10,
        partial_discharge_pC: Math.round(boundedPd),
        load_percent: Math.round(boundedLoad * 10) / 10,
        oil_quality_index: Math.round(boundedOil * 10) / 10,
        voltage_v: Math.round(boundedVoltage),
        current_a: Math.round(boundedCurrent)
      });
    }

    if (updatedReadings.length > 0) {
      this.store.setReadings(updatedReadings, true);
    }
  }

  public getStatus() {
    const readings = this.store.getAllReadings();
    const telemetry: Record<string, SensorReading> = {};
    for (const id of this.targetAssets) {
      if (readings[id]) {
        telemetry[id] = readings[id];
      }
    }
    
    return {
      isRunning: this.isRunning,
      currentWeather: this.currentWeather,
      currentPreset: this.currentPreset,
      lastUpdate: this.lastUpdate,
      telemetry
    };
  }
}
