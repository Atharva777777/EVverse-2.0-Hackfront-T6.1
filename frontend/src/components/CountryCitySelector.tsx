"use client";



export interface GlobalCityOption {
  city: string;
  country: string;
  lat: number;
  lng: number;
  zoom: number;
  desc: string;
  flag: string;
}

export const SUPPORTED_COUNTRIES: { name: string; flag: string; cities: string[] }[] = [
  { name: "China", flag: "🇨🇳", cities: ["Shenzhen", "Beijing"] },
  { name: "India", flag: "🇮🇳", cities: [
    "Mumbai", "Navi Mumbai", "Thane", "Kalyan-Dombivli", "Mira-Bhayandar",
    "Vasai-Virar", "Pune", "Pimpri-Chinchwad", "Hinjawadi", "Talegaon Dabhade",
    "Chakan", "Nashik", "Ahilyanagar (Ahmednagar)", "Kolhapur", "Sangli",
    "Satara", "Solapur", "Dhule", "Jalgaon", "Chhatrapati Sambhajinagar",
    "Latur", "Nanded", "Nagpur", "Amravati", "Akola"
  ] },
  { name: "United States", flag: "🇺🇸", cities: ["San Francisco", "Los Angeles", "Chicago"] },
];

export const CITY_CONFIGS: Record<string, GlobalCityOption> = {
  "Shenzhen": { city: "Shenzhen", country: "China", lat: 22.6349, lng: 114.0808, zoom: 13, desc: "Shenzhen Mobility & Tech Corridor", flag: "🇨🇳" },
  "Beijing": { city: "Beijing", country: "China", lat: 39.9096, lng: 116.3445, zoom: 12, desc: "Capital Metropolitan Region", flag: "🇨🇳" },
  "Mumbai": { city: "Mumbai", country: "India", lat: 19.0467, lng: 72.8911, zoom: 12, desc: "Financial Capital & Megacity", flag: "🇮🇳" },
  "Navi Mumbai": { city: "Navi Mumbai", country: "India", lat: 19.0330, lng: 73.0297, zoom: 12, desc: "Planned Satellite City", flag: "🇮🇳" },
  "Thane": { city: "Thane", country: "India", lat: 19.2183, lng: 72.9781, zoom: 12, desc: "Mumbai Metropolitan Region", flag: "🇮🇳" },
  "Kalyan-Dombivli": { city: "Kalyan-Dombivli", country: "India", lat: 19.2437, lng: 73.1355, zoom: 12, desc: "MMR Urban Agglomeration", flag: "🇮🇳" },
  "Mira-Bhayandar": { city: "Mira-Bhayandar", country: "India", lat: 19.2952, lng: 72.8544, zoom: 12, desc: "MMR Urban Agglomeration", flag: "🇮🇳" },
  "Vasai-Virar": { city: "Vasai-Virar", country: "India", lat: 19.3919, lng: 72.8397, zoom: 12, desc: "MMR Urban Agglomeration", flag: "🇮🇳" },
  "Pune": { city: "Pune", country: "India", lat: 18.5204, lng: 73.8567, zoom: 12, desc: "Cultural & Tech Hub", flag: "🇮🇳" },
  "Pimpri-Chinchwad": { city: "Pimpri-Chinchwad", country: "India", lat: 18.6298, lng: 73.7997, zoom: 12, desc: "Industrial & Auto Hub", flag: "🇮🇳" },
  "Hinjawadi": { city: "Hinjawadi", country: "India", lat: 18.5913, lng: 73.7389, zoom: 13, desc: "IT Park & Tech Corridor", flag: "🇮🇳" },
  "Talegaon Dabhade": { city: "Talegaon Dabhade", country: "India", lat: 18.7275, lng: 73.6826, zoom: 13, desc: "Industrial Node", flag: "🇮🇳" },
  "Chakan": { city: "Chakan", country: "India", lat: 18.7501, lng: 73.8772, zoom: 13, desc: "Automotive Hub", flag: "🇮🇳" },
  "Nashik": { city: "Nashik", country: "India", lat: 19.9975, lng: 73.7898, zoom: 12, desc: "Golden Triangle City", flag: "🇮🇳" },
  "Ahilyanagar (Ahmednagar)": { city: "Ahilyanagar (Ahmednagar)", country: "India", lat: 19.0952, lng: 74.7496, zoom: 12, desc: "Historic District Center", flag: "🇮🇳" },
  "Kolhapur": { city: "Kolhapur", country: "India", lat: 16.7050, lng: 74.2433, zoom: 12, desc: "Southern Maharashtra Center", flag: "🇮🇳" },
  "Sangli": { city: "Sangli", country: "India", lat: 16.8524, lng: 74.5815, zoom: 12, desc: "Agriculture & Trade Hub", flag: "🇮🇳" },
  "Satara": { city: "Satara", country: "India", lat: 17.6805, lng: 74.0183, zoom: 12, desc: "Heritage & Agriculture", flag: "🇮🇳" },
  "Solapur": { city: "Solapur", country: "India", lat: 17.6599, lng: 75.9064, zoom: 12, desc: "Textile & Trade Center", flag: "🇮🇳" },
  "Dhule": { city: "Dhule", country: "India", lat: 20.9042, lng: 74.7749, zoom: 12, desc: "Northern Maharashtra Center", flag: "🇮🇳" },
  "Jalgaon": { city: "Jalgaon", country: "India", lat: 21.0077, lng: 75.5626, zoom: 12, desc: "Gold & Agriculture City", flag: "🇮🇳" },
  "Chhatrapati Sambhajinagar": { city: "Chhatrapati Sambhajinagar", country: "India", lat: 19.8762, lng: 75.3433, zoom: 12, desc: "Tourism & Industrial Hub", flag: "🇮🇳" },
  "Latur": { city: "Latur", country: "India", lat: 18.4088, lng: 76.5604, zoom: 12, desc: "Marathwada Agricultural Hub", flag: "🇮🇳" },
  "Nanded": { city: "Nanded", country: "India", lat: 19.1383, lng: 77.3210, zoom: 12, desc: "Historic & Educational Center", flag: "🇮🇳" },
  "Nagpur": { city: "Nagpur", country: "India", lat: 21.1458, lng: 79.0882, zoom: 12, desc: "Winter Capital & Logistics Hub", flag: "🇮🇳" },
  "Amravati": { city: "Amravati", country: "India", lat: 20.9320, lng: 77.7523, zoom: 12, desc: "Vidarbha Cultural Center", flag: "🇮🇳" },
  "Akola": { city: "Akola", country: "India", lat: 20.7059, lng: 77.0019, zoom: 12, desc: "Cotton City", flag: "🇮🇳" },
  
  "San Francisco": { city: "San Francisco", country: "United States", lat: 37.8032, lng: -122.4005, zoom: 13, desc: "Bay Area Innovation Corridor", flag: "🇺🇸" },
  "Los Angeles": { city: "Los Angeles", country: "United States", lat: 34.0923, lng: -118.2904, zoom: 12, desc: "Southern California Core", flag: "🇺🇸" },
  "Chicago": { city: "Chicago", country: "United States", lat: 41.9003, lng: -87.7022, zoom: 12, desc: "Midwest Transit Hub", flag: "🇺🇸" },
};

interface CountryCitySelectorProps {
  selectedCountry: string;
  selectedCity: string;
  onCountrySelect: (country: string) => void;
  onCitySelect: (city: string, country: string, lat: number, lng: number) => void;
  disabled?: boolean;
}

export function CountryCitySelector({
  selectedCountry,
  selectedCity,
  onCountrySelect,
  onCitySelect,
  disabled = false,
}: CountryCitySelectorProps) {
  const currentCountryObj = SUPPORTED_COUNTRIES.find((c) => c.name === selectedCountry) || SUPPORTED_COUNTRIES[2];
  const availableCities = currentCountryObj.cities;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* ── STEP 1: Country Selection ───────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ fontFamily: "Times New Roman, serif", fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-ink-4)" }}>
            Step 1 · Select Country
          </span>
          <span style={{ fontFamily: "Times New Roman, serif", fontSize: "11px", color: "var(--color-navy-600)" }}>
            3 Available
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          {SUPPORTED_COUNTRIES.map((c) => {
            const isSelected = c.name === selectedCountry;
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => {
                  if (disabled) return;
                  onCountrySelect(c.name);
                  // Automatically choose the first city of that country
                  const firstCity = c.cities[0];
                  const cfg = CITY_CONFIGS[firstCity];
                  if (cfg) {
                    onCitySelect(firstCity, c.name, cfg.lat, cfg.lng);
                  }
                }}
                disabled={disabled}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  padding: "10px 4px",
                  borderRadius: "10px",
                  border: isSelected ? "2px solid var(--color-navy-900)" : "1px solid var(--color-border)",
                  background: isSelected ? "var(--color-navy-900)" : "white",
                  color: isSelected ? "white" : "var(--color-ink)",
                  fontFamily: "Times New Roman, serif",
                  cursor: disabled ? "not-allowed" : "pointer",
                  transition: "all 0.18s ease",
                  boxShadow: isSelected ? "0 4px 12px rgba(10,22,40,0.18)" : "0 1px 3px rgba(0,0,0,0.04)",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                <span style={{ fontSize: "18px", lineHeight: 1 }}>{c.flag}</span>
                <span style={{ fontSize: "12px", fontWeight: isSelected ? 600 : 500, textAlign: "center", lineHeight: 1.2 }}>
                  {c.name}
                </span>
                <span style={{ fontSize: "10px", color: isSelected ? "rgba(255,255,255,0.75)" : "var(--color-ink-4)" }}>
                  {c.cities.length} {c.cities.length === 1 ? "city" : "cities"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── STEP 2: City Selection (Dynamically Filtered) ───────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ fontFamily: "Times New Roman, serif", fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-ink-4)" }}>
            Step 2 · Select Metropolitan City
          </span>
          <span style={{ fontFamily: "Times New Roman, serif", fontSize: "11px", color: "var(--color-ink-3)" }}>
            in {selectedCountry}
          </span>
        </div>

        {availableCities.length > 1 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {availableCities.map((city) => {
              const isSelected = city === selectedCity;
              const cfg = CITY_CONFIGS[city];
              return (
                <button
                  key={city}
                  type="button"
                  onClick={() => {
                    if (disabled || !cfg) return;
                    onCitySelect(city, selectedCountry, cfg.lat, cfg.lng);
                  }}
                  disabled={disabled}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: isSelected ? "1.5px solid var(--color-navy-800)" : "1px solid var(--color-border)",
                    background: isSelected ? "rgba(10,22,40,0.05)" : "white",
                    cursor: disabled ? "not-allowed" : "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: isSelected ? 700 : 500, color: "var(--color-ink)" }}>
                        {city}
                      </span>
                      {isSelected && (
                        <span style={{ fontSize: "10px", background: "var(--color-navy-900)", color: "white", padding: "1px 6px", borderRadius: "99px" }}>
                          Active
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-ink-4)", marginTop: "2px" }}>
                      {cfg?.desc}
                    </div>
                  </div>
                  <div style={{ fontSize: "12px", color: isSelected ? "var(--color-navy-900)" : "var(--color-ink-4)" }}>
                    →
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          // Single available city (e.g. Shenzhen for China, Mumbai for India)
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1.5px solid var(--color-navy-800)",
              background: "rgba(10,22,40,0.05)",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-ink)" }}>
                  {availableCities[0]}
                </span>
                <span style={{ fontSize: "10px", background: "var(--color-navy-900)", color: "white", padding: "1px 6px", borderRadius: "99px" }}>
                  Selected
                </span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-ink-4)", marginTop: "2px" }}>
                {CITY_CONFIGS[availableCities[0]]?.desc}
              </div>
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-navy-900)" }}>
              ✓
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
