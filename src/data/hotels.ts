export type Hotel = {
  id: string
  name: string
  city: string
  region: string
  roomsAvailable: number
  nightlyFrom: number
  image: string
  vibe: string
}

export const hotels: Hotel[] = [
  {
    id: 'harbor-house',
    name: 'Harbor House',
    city: 'Seattle',
    region: 'Pacific Northwest',
    roomsAvailable: 42,
    nightlyFrom: 189,
    image:
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80',
    vibe: 'Waterfront suites with quiet morning light',
  },
  {
    id: 'cedar-line',
    name: 'Cedar Line Lodge',
    city: 'Aspen',
    region: 'Rocky Mountains',
    roomsAvailable: 28,
    nightlyFrom: 246,
    image:
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1400&q=80',
    vibe: 'Timber rooms for retreats and winter weekends',
  },
  {
    id: 'solstice-court',
    name: 'Solstice Court',
    city: 'Santa Fe',
    region: 'High Desert',
    roomsAvailable: 36,
    nightlyFrom: 168,
    image:
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1400&q=80',
    vibe: 'Courtyard stays for gatherings under open sky',
  },
  {
    id: 'atelier-river',
    name: 'Atelier River',
    city: 'Chicago',
    region: 'Great Lakes',
    roomsAvailable: 55,
    nightlyFrom: 214,
    image:
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1400&q=80',
    vibe: 'City blocks with meeting rooms on every floor',
  },
]
