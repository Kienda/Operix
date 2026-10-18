import { describe, expect, it } from 'vitest';
import { haversineDistanceMeters, isWithinGeofence } from './geo.util';

describe('haversineDistanceMeters', () => {
  it('returns ~0 for the same point', () => {
    const point = { latitude: 9.537, longitude: -13.6785 };
    expect(haversineDistanceMeters(point, point)).toBeLessThan(0.001);
  });

  it('matches a known distance between two cities within 1%', () => {
    // Conakry, Guinea -> Freetown, Sierra Leone: ~136 km great-circle.
    const conakry = { latitude: 9.6412, longitude: -13.5784 };
    const freetown = { latitude: 8.4657, longitude: -13.2317 };
    const distanceKm = haversineDistanceMeters(conakry, freetown) / 1000;
    expect(distanceKm).toBeGreaterThan(134);
    expect(distanceKm).toBeLessThan(138);
  });
});

describe('isWithinGeofence', () => {
  const office = { latitude: 9.537, longitude: -13.6785 };

  it('accepts a point inside the radius', () => {
    const nearby = { latitude: 9.5371, longitude: -13.6785 };
    expect(isWithinGeofence(nearby, office, 150)).toBe(true);
  });

  it('rejects a point outside the radius', () => {
    const farAway = { latitude: 9.55, longitude: -13.6785 };
    expect(isWithinGeofence(farAway, office, 150)).toBe(false);
  });

  it('treats the boundary as inside', () => {
    const distance = haversineDistanceMeters(office, { latitude: 9.538, longitude: -13.6785 });
    expect(
      isWithinGeofence({ latitude: 9.538, longitude: -13.6785 }, office, Math.ceil(distance)),
    ).toBe(true);
  });
});
