# Hierarchy Management System

A React-based organizational chart system that connects to the SureLC API to display agency hierarchies in a visual flowchart format.

## Features

- **Visual Hierarchy Display**: Shows Agency → Sub-agencies/Branches → Producers in a vertical flowchart layout
- **Real-time Data**: Connects directly to SureLC REST API for live data
- **Interactive Features**: 
  - Search producers by NPN
  - Click on producers for details
  - Refresh data with delta updates
- **Status Indicators**: Visual badges for producer status, errors, and warnings
- **Responsive Design**: Works on desktop and mobile devices

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
# or
yarn install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your SureLC credentials:

```env
VITE_SURELC_BASE=https://surelc.surancebay.com/sbweb/ws
VITE_SURELC_USER=your_agency_username
VITE_SURELC_PASS=your_agency_password
VITE_FIRM_ID=your_firm_id
VITE_INITIAL_SNAPSHOT_DATE=2000-01-01T00:00:00Z
VITE_PAGE_LIMIT=500
```

**Required Information:**
- `VITE_SURELC_USER`: Your SureLC agency username
- `VITE_SURELC_PASS`: Your SureLC agency password  
- `VITE_FIRM_ID`: Your firm/agency ID (numeric)

### 3. Run the Application

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

The application will start at `http://localhost:3000`

## API Endpoints Used

The system uses these SureLC API endpoints:

- `GET /firm/relationship/after/{date}` - Fetch all firm-producer relationships
- `GET /producer/{producerId}` - Get producer details
- `GET /producer/npn/{npn}` - Find producer by NPN
- `GET /producer/{producerId}/relationship` - Get producer relationship details

## Project Structure

```
src/
├── components/
│   ├── OrgChart.tsx          # Main org chart component
│   └── OrgChart.css          # Chart styling
├── lib/
│   ├── api.ts                # API client functions
│   ├── transform.ts          # Data transformation logic
│   └── types.ts              # TypeScript interfaces
├── App.tsx                   # Main application
├── App.css                   # Application styles
├── main.tsx                  # React entry point
└── index.css                 # Global styles
```

## How It Works

1. **Authentication**: Uses HTTP Basic Auth with your SureLC credentials
2. **Data Fetching**: Retrieves firm relationships using paginated API calls
3. **Data Transform**: Converts API responses to hierarchical tree structure
4. **Visualization**: Renders as vertical organizational chart matching your flowchart example
5. **Interactivity**: Supports search, refresh, and producer selection

## Features in Detail

### Search by NPN
- Enter any producer's NPN in the search box
- System will highlight and scroll to the producer if found
- Shows error if producer not found or not in current hierarchy

### Refresh Data
- Click refresh button to get latest updates
- Uses delta loading (only fetches changes since last update)
- Preserves current view and selections

### Producer Details
- Click on any producer node to select them
- Shows producer information (avoiding PII)
- Displays status badges and error/warning indicators

### Visual Hierarchy
- **Agency Level**: Gray background, larger size
- **Branch Level**: Dark background, medium size  
- **Producer Level**: Dark background, smaller size
- **Connection Lines**: Visual lines showing relationships
- **Status Badges**: Color-coded status indicators
- **Error/Warning Icons**: Red/yellow indicators with tooltips

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run typecheck    # Run TypeScript checks
```

## Troubleshooting

### Authentication Issues
- Verify your SureLC credentials are correct
- Ensure your account has `ROLE_AGENCY` permissions
- Check that the base URL is correct

### No Data Displayed
- Verify your `FIRM_ID` is correct
- Check that your firm has producer relationships in the system
- Look at browser console for API errors

### Performance Issues
- The system respects API rate limits (20 req/sec)
- Large hierarchies may take longer to load initially
- Consider adjusting `PAGE_LIMIT` for your data size

## Security Notes

- Never commit your `.env` file to version control
- The system avoids displaying PII like SSN or sensitive producer data
- API credentials are handled securely through environment variables
- Consider using a backend proxy in production for additional security

## Next Steps

When you have your credentials ready, you can:
1. Set up the `.env` file with your information
2. Run the application
3. Test with your actual hierarchy data
4. Customize styling and features as needed

Let me know if you need help with any of these steps!