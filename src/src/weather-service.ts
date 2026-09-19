export interface WeatherData {
  timestamp: string;
  location: string;

  weather: {
    temperature: number;
    windSpeed: number;
    rainfall: number;
    lightningRisk: number;
    stormSeverity: number;
  };
}

const regions = [
  { name: "North Bay", latitude: 37.82, longitude: -122.28 },
  { name: "Riverside", latitude: 33.98, longitude: -117.37 },
  { name: "Eastport", latitude: 37.64, longitude: -122.05 },
  { name: "Central Valley", latitude: 36.74, longitude: -119.78 },
  { name: "South Shore", latitude: 33.70, longitude: -117.90 },
];

export async function getWeather(): Promise<WeatherData[]> {
  const results: WeatherData[] = [];

  for (const region of regions) {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${region.latitude}` +
      `&longitude=${region.longitude}` +
      `&current=temperature_2m,wind_speed_10m,rain`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Weather API failed for ${region.name}: ${response.status}`
      );
    }

    const data = await response.json();

    results.push({
      timestamp: new Date().toISOString(),
      location: region.name,

      weather: {
        temperature: data.current.temperature_2m,
        windSpeed: data.current.wind_speed_10m,
        rainfall: data.current.rain,

        // These will be handled separately later.
        lightningRisk: 0,
        stormSeverity: 0,
      },
    });
  }

  return results;
}