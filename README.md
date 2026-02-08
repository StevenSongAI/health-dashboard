# Health Dashboard

A personal health tracking dashboard with protocol management, symptom tracking, and health insights.

## Features

- **Overview**: At-a-glance status, protocol card, today's status, alerts
- **Protocol**: Supplement schedule with timing visual, history timeline
- **Symptom Tracker**: Quick log form (sliders 0-10), trend charts, correlation panel
- **Research**: Searchable study summaries, agent findings
- **Meals & Reactions**: Food log, reaction matrix, reintroduction tracker
- **Vitals & Energy**: Energy/sleep/exercise tracking, correlations
- **Briefings**: Archive of morning/evening briefings

## Tech Stack

- Node.js + Express backend
- Static HTML/CSS/JS frontend
- JSON files for data (no external DB)
- Chart.js via CDN
- TailwindCSS via CDN
- Dark theme, responsive

## Installation

```bash
npm install
npm start
```

## Development

```bash
npm run dev
```

## API Endpoints

### Overview
- `GET /api/overview` - Dashboard overview data

### Protocol
- `GET /api/protocol` - Get current protocol
- `POST /api/protocol` - Update protocol
- `POST /api/protocol/supplement` - Add supplement

### Symptoms
- `GET /api/symptoms` - List symptoms
- `POST /api/symptoms` - Log symptom
- `GET /api/symptoms/trends` - Get symptom trends

### Meals & Reactions
- `GET /api/meals` - List meals
- `POST /api/meals` - Log meal
- `GET /api/reactions` - List reactions
- `POST /api/reactions` - Log reaction

### Vitals
- `GET /api/energy` - Energy logs
- `POST /api/energy` - Log energy
- `GET /api/sleep` - Sleep logs
- `POST /api/sleep` - Log sleep
- `GET /api/exercise` - Exercise logs
- `POST /api/exercise` - Log exercise

### Research
- `GET /api/research` - List research
- `POST /api/research` - Add research
- `GET /api/research/search?q=term` - Search research

### Briefings
- `GET /api/briefings` - List briefings
- `POST /api/briefings` - Create briefing

### Agent Endpoints
- `POST /api/agent/protocol-update` - Agent protocol update
- `POST /api/agent/symptom-report` - Agent symptom report
- `POST /api/agent/research-findings` - Agent research findings
- `POST /api/agent/briefing` - Agent briefing
- `POST /api/agent/meal-reaction` - Agent meal reaction

## License

MIT