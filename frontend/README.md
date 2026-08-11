# Brazilian Education Infrastructure Dashboard - Frontend

A React + TypeScript + Vite frontend for visualizing Brazilian education data with interactive maps and analytics.

## 🚀 Production Deployment

✅ **Live on Azure Storage Static Website**
- Automated deployment via GitHub Actions
- Push to `main` → Automatic build and deploy
- URL: https://stedubrazilwebprod.z15.web.core.windows.net

## 🏗️ What's Implemented

### ✅ Core Features
- **Interactive Map**: Leaflet-based map with hexagon visualization
- **Education Analytics**: Real-time data from GeoDjango backend
- **Responsive Design**: Mobile and desktop optimized with Tailwind CSS
- **State Management**: Zustand for efficient state handling
- **API Integration**: React Query with proper caching and error handling
- **Modern UI**: Shadcn/ui component library integration

### ✅ Technical Stack
- **Build Tool**: Vite for fast development and optimized builds
- **Language**: TypeScript with full type safety
- **Package Manager**: Bun for lightning-fast installs
- **Styling**: Tailwind CSS + shadcn/ui components
- **Maps**: Leaflet.js for interactive visualization
- **HTTP Client**: Axios with React Query
- **State**: Zustand stores

## 🚀 Quick Start

### Development

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview
```

### Environment Variables

Create a `.env` file:

```env
VITE_API_BASE_URL=https://aca-backend-edubrazilweb-prod.wonderfulpond-07f886cb.eastus2.azurecontainerapps.io
# Optional: set only if you want a custom hard timeout for API requests.
# Leaving it unset disables the client-side timeout by default.
# VITE_API_TIMEOUT_MS=180000
```

## 📁 Project Structure

```
src/
├── components/
│   ├── analytics/       # Analytics panels and charts
│   ├── calculator/      # Education calculators
│   ├── controls/        # Map and filter controls
│   ├── layout/         # Header, footer, layout components
│   ├── maps/           # Map components and layers
│   ├── ui/             # Shadcn/ui base components
│   └── widgets/        # Reusable widget components
├── hooks/
│   └── api/           # Custom React Query hooks
├── lib/
│   ├── api/           # API client and endpoints
│   ├── stores/        # Zustand state stores
│   └── utils/         # Utility functions
├── pages/
│   └── DashboardPage/ # Main dashboard page
├── types/
│   ├── api.ts         # API response types
│   └── dashboard.ts   # Dashboard types
└── main.tsx           # App entry point
```

## 🧪 Testing

```bash
# Run linter
bun run lint

# Type check
bun run type-check
```

## 🚢 Deployment

### Automated (Production)
Push to `main` branch triggers automatic deployment to Azure Storage.

### Manual Deploy
```bash
# Build
bun run build

# Deploy to Azure Storage
az storage blob upload-batch \
  --account-name stedubrazilwebprod \
  --auth-mode key \
  -d '$web' \
  -s dist \
  --overwrite
```

## 📚 Key Technologies

- **Vite**: Lightning-fast build tool
- **React 18**: Modern React with hooks
- **TypeScript**: Full type safety
- **Tailwind CSS**: Utility-first CSS
- **Shadcn/ui**: High-quality React components
- **Leaflet**: Interactive map library
- **React Query**: Server state management
- **Zustand**: Client state management
- **Axios**: HTTP client

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

---

**Status**: ✅ Production ready and deployed on Azure
