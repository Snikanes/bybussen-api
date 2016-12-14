//+-----------------------------------------------------------------------------
//
// Haversine algorithm
//
//------------------------------------------------------------------------------
const to_rad = (num) => num * Math.PI / 180

const haversine = (lat1, lon1, lat2, lon2, unit) => {
  const R = 6371000

  const φ1 = to_rad(lat1)
  , φ2 = to_rad(lat2)
  , Δλ = to_rad(lon2 - lon1)

  const distance = Math.acos(Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)) * R

  return distance
}

module.exports = haversine;
