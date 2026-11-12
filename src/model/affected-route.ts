/** Durak değişikliğinden etkilenen bir hat ve onu etkileyen durakların id'leri (sunucudaki satırla birebir). */
export interface AffectedRoute {
  routeId: string;
  stopIds: string[];
}
