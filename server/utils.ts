/**
 * Calcula a distância entre duas coordenadas geográficas usando a fórmula de Haversine.
 * @param {number} lat1 - Latitude do primeiro ponto em graus.
 * @param {number} lon1 - Longitude do primeiro ponto em graus.
 * @param {number} lat2 - Latitude do segundo ponto em graus.
 * @param {number} lon2 - Longitude do segundo ponto em graus.
 * @returns {number} - Distância em metros.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Raio médio da Terra em metros
  const rad = Math.PI / 180; // Fator de conversão de graus para radianos
  const φ1 = lat1 * rad;
  const φ2 = lat2 * rad;
  const Δφ = (lat2 - lat1) * rad;
  const Δλ = (lon2 - lon1) * rad;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distancia = R * c;
  return distancia;
}
