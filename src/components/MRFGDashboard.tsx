import React from 'react';
import { 
  TrendingUp, 
  Users, 
  Shield, 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Award,
  Building2,
  Target,
  Activity
} from 'lucide-react';
import type { MRFGDashboardData, EnhancedProducerProfile } from '../lib/types';
import './MRFGDashboard.css';

interface MRFGDashboardProps {
  dashboardData?: MRFGDashboardData;
  enhancedProfiles: Map<number, EnhancedProducerProfile>;
  onProducerSelect?: (producerId: number) => void;
}

const MRFGDashboard: React.FC<MRFGDashboardProps> = ({
  dashboardData,
  enhancedProfiles,
  onProducerSelect
}) => {
  if (!dashboardData && enhancedProfiles.size === 0) {
    return (
      <div className="mrfg-dashboard-empty">
        <Building2 size={48} />
        <h3>Loading MRFG Data...</h3>
        <p>Please wait while we load Major Revolution Financial Group producer data</p>
        <div style={{marginTop: '16px', fontSize: '14px', color: '#9ca3af'}}>
          💡 Tip: Make sure hierarchy data is loaded first, then enhanced profiles will populate automatically
        </div>
      </div>
    );
  }

  // Calculate real-time metrics from enhanced profiles
  const profilesArray = Array.from(enhancedProfiles.values());
  const totalProducers = profilesArray.length;
  const activeProducers = profilesArray.filter(p => 
    p.relationship?.status?.toLowerCase() === 'active'
  ).length;
  
  // Calculate date range for MRFG producers
  const dateRange = profilesArray.reduce((range, profile) => {
    const addedDate = profile.relationship?.addedOn;
    if (addedDate) {
      const date = new Date(addedDate);
      if (!range.earliest || date < range.earliest) {
        range.earliest = date;
      }
      if (!range.latest || date > range.latest) {
        range.latest = date;
      }
    }
    return range;
  }, { earliest: null as Date | null, latest: null as Date | null });
  
  // Debug logging
  React.useEffect(() => {
    console.log('🎯 MRFG Dashboard Data Debug:', {
      enhancedProfilesSize: enhancedProfiles.size,
      profilesArray: profilesArray.length,
      totalProducers,
      activeProducers,
      sampleProfile: profilesArray[0] ? {
        id: profilesArray[0].basic.id,
        name: profilesArray[0].basic.name,
        licensesCount: profilesArray[0].licenses.length,
        appointmentsCount: profilesArray[0].appointments.length,
        contractsCount: profilesArray[0].contracts.length,
        complianceStatus: profilesArray[0].complianceStatus
      } : null
    });
  }, [enhancedProfiles.size, totalProducers]);

  const complianceCounts = profilesArray.reduce((acc, profile) => {
    const status = profile.complianceStatus.licenseCompliance;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const appointmentCounts = profilesArray.reduce((acc, profile) => {
    const status = profile.complianceStatus.appointmentStatus;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const getComplianceIcon = (status: string) => {
    switch (status) {
      case 'compliant': return <CheckCircle size={16} className="text-green-500" />;
      case 'expiring': return <Clock size={16} className="text-yellow-500" />;
      case 'expired': return <AlertTriangle size={16} className="text-red-500" />;
      default: return <Shield size={16} className="text-gray-500" />;
    }
  };

  const getComplianceColor = (status: string) => {
    switch (status) {
      case 'compliant': return 'success';
      case 'expiring': return 'warning';
      case 'expired': return 'danger';
      default: return 'neutral';
    }
  };

  const renderMetricCard = (
    title: string, 
    value: number, 
    icon: React.ReactNode, 
    subtitle?: string,
    trend?: { value: number; isPositive: boolean }
  ) => (
    <div className="metric-card">
      <div className="metric-header">
        <div className="metric-icon">
          {icon}
        </div>
        {trend && (
          <div className={`metric-trend ${trend.isPositive ? 'positive' : 'negative'}`}>
            <TrendingUp size={14} />
            <span>{trend.value > 0 ? '+' : ''}{trend.value}%</span>
          </div>
        )}
      </div>
      <div className="metric-content">
        <div className="metric-value">{value}</div>
        <div className="metric-title">{title}</div>
        {subtitle && <div className="metric-subtitle">{subtitle}</div>}
      </div>
    </div>
  );

  const renderComplianceBreakdown = () => (
    <div className="compliance-breakdown">
      <div className="breakdown-header">
        <h3>
          <Shield size={20} />
          License Compliance
        </h3>
      </div>
      <div className="compliance-items">
        {Object.entries(complianceCounts).map(([status, count]) => (
          <div key={status} className="compliance-item">
            <div className="compliance-item-header">
              {getComplianceIcon(status)}
              <span className="compliance-label">
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
            <div className={`compliance-value ${getComplianceColor(status)}`}>
              {count}
            </div>
            <div className="compliance-percentage">
              {totalProducers > 0 ? Math.round((count / totalProducers) * 100) : 0}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderAppointmentStatus = () => (
    <div className="appointment-status">
      <div className="breakdown-header">
        <h3>
          <Building2 size={20} />
          Appointment Status
        </h3>
      </div>
      <div className="appointment-items">
        {Object.entries(appointmentCounts).map(([status, count]) => (
          <div key={status} className="appointment-item">
            <div className="appointment-item-header">
              <span className="appointment-label">
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
            <div className={`appointment-value ${getComplianceColor(status)}`}>
              {count}
            </div>
            <div className="appointment-percentage">
              {totalProducers > 0 ? Math.round((count / totalProducers) * 100) : 0}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTopPerformers = () => {
    // Sort profiles by number of licenses and appointments
    const sortedProfiles = profilesArray
      .sort((a, b) => {
        const aScore = a.licenses.length + a.appointments.length + a.contracts.length;
        const bScore = b.licenses.length + b.appointments.length + b.contracts.length;
        return bScore - aScore;
      })
      .slice(0, 5);

    return (
      <div className="top-performers">
        <div className="breakdown-header">
          <h3>
            <Award size={20} />
            Top Performers
          </h3>
          <span className="breakdown-subtitle">By licenses, appointments & contracts</span>
        </div>
        <div className="performers-list">
          {sortedProfiles.map((profile, index) => {
            const totalScore = profile.licenses.length + profile.appointments.length + profile.contracts.length;
            return (
              <div 
                key={profile.basic.id} 
                className="performer-item"
                onClick={() => onProducerSelect?.(profile.basic.id)}
              >
                <div className="performer-rank">#{index + 1}</div>
                <div className="performer-info">
                  <div className="performer-name">{profile.basic.name}</div>
                  <div className="performer-stats">
                    <span>{profile.licenses.length}L</span>
                    <span>{profile.appointments.length}A</span>
                    <span>{profile.contracts.length}C</span>
                  </div>
                </div>
                <div className="performer-score">
                  <div className="score-value">{totalScore}</div>
                  <div className="score-label">Total</div>
                </div>
                <div className={`performer-compliance ${getComplianceColor(profile.complianceStatus.licenseCompliance)}`}>
                  {getComplianceIcon(profile.complianceStatus.licenseCompliance)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderRecentActivity = () => {
    // Get recently updated profiles (by lastUpdated)
    const recentProfiles = profilesArray
      .filter(p => p.lastUpdated)
      .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
      .slice(0, 5);

    return (
      <div className="recent-activity">
        <div className="breakdown-header">
          <h3>
            <Activity size={20} />
            Recent Activity
          </h3>
        </div>
        <div className="activity-list">
          {recentProfiles.map(profile => (
            <div 
              key={profile.basic.id} 
              className="activity-item"
              onClick={() => onProducerSelect?.(profile.basic.id)}
            >
              <div className="activity-info">
                <div className="activity-name">{profile.basic.name}</div>
                <div className="activity-details">
                  Profile updated • {new Date(profile.lastUpdated).toLocaleDateString()}
                </div>
              </div>
              <div className="activity-indicators">
                {profile.complianceStatus.hasErrors && (
                  <AlertTriangle size={14} className="text-red-500" />
                )}
                {profile.complianceStatus.hasWarnings && (
                  <Clock size={14} className="text-yellow-500" />
                )}
              </div>
            </div>
          ))}
          {recentProfiles.length === 0 && (
            <div className="no-activity">
              <Calendar size={24} />
              <p>No recent activity</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAllProducers = () => {
    // Sort producers by ID for consistent display
    const sortedProducers = profilesArray.sort((a, b) => a.basic.id - b.basic.id);

    return (
      <div className="all-producers">
        <div className="breakdown-header">
          <h3>
            <Users size={20} />
            All MRFG Producers
          </h3>
          <span className="breakdown-subtitle">Complete producer directory</span>
        </div>
        <div className="producers-list">
          {sortedProducers.map(profile => (
            <div 
              key={profile.basic.id} 
              className="producer-item"
              onClick={() => onProducerSelect?.(profile.basic.id)}
            >
              <div className="producer-id">#{profile.basic.id}</div>
              <div className="producer-info">
                <div className="producer-name">{profile.basic.name}</div>
                <div className="producer-details">
                  <span className="producer-npn">{profile.basic.npn || 'N/A'}</span>
                  <span className="producer-status">
                    {profile.relationship?.status || 'Unknown'}
                  </span>
                </div>
              </div>
              <div className="producer-meta">
                <div className="producer-date">
                  {profile.relationship?.addedOn ? 
                    new Date(profile.relationship.addedOn).toLocaleDateString() : 
                    'N/A'
                  }
                </div>
                <div className={`producer-compliance ${getComplianceColor(profile.complianceStatus.licenseCompliance)}`}>
                  {getComplianceIcon(profile.complianceStatus.licenseCompliance)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mrfg-dashboard">
      <div className="dashboard-header">
        <div className="dashboard-title">
          <Building2 size={24} />
          <div>
            <h2>Major Revolution Financial Group</h2>
            <p>Comprehensive Producer Management Dashboard</p>
          </div>
        </div>
        <div className="dashboard-actions">
          <div className="date-range-info">
            {dateRange.earliest && dateRange.latest && (
              <div className="date-range">
                <span className="date-range-label">Producer Range:</span>
                <span className="date-range-value">
                  {dateRange.earliest.toLocaleDateString()} - {dateRange.latest.toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
          <div className="last-updated">
            Last Updated: {new Date().toLocaleString()}
          </div>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="metrics-row">
        {renderMetricCard(
          'Total Producers', 
          totalProducers, 
          <Users size={24} />,
          'Active MRFG agents'
        )}
        {renderMetricCard(
          'Active Producers', 
          activeProducers, 
          <Target size={24} />,
          `${totalProducers > 0 ? Math.round((activeProducers / totalProducers) * 100) : 0}% of total`
        )}
        {renderMetricCard(
          'Compliant', 
          complianceCounts.compliant || 0, 
          <CheckCircle size={24} />,
          'License compliant'
        )}
        {renderMetricCard(
          'Need Attention', 
          (complianceCounts.expiring || 0) + (complianceCounts.expired || 0), 
          <AlertTriangle size={24} />,
          'Expiring or expired'
        )}
      </div>

      {/* Dashboard Content Grid */}
      <div className="dashboard-grid">
        <div className="dashboard-column">
          {renderComplianceBreakdown()}
          {renderAppointmentStatus()}
        </div>
        <div className="dashboard-column">
          {renderTopPerformers()}
          {renderRecentActivity()}
        </div>
      </div>

      {/* All MRFG Producers Section */}
      {renderAllProducers()}

      {/* Growth Metrics - Placeholder for future implementation */}
      <div className="growth-section">
        <div className="growth-header">
          <h3>
            <TrendingUp size={20} />
            Growth Metrics
          </h3>
          <span className="growth-subtitle">Coming soon - Historical growth analysis</span>
        </div>
        <div className="growth-placeholder">
          <div className="growth-card">
            <div className="growth-metric">
              <div className="growth-value">--</div>
              <div className="growth-label">Monthly Growth</div>
            </div>
          </div>
          <div className="growth-card">
            <div className="growth-metric">
              <div className="growth-value">--</div>
              <div className="growth-label">Quarterly Growth</div>
            </div>
          </div>
          <div className="growth-card">
            <div className="growth-metric">
              <div className="growth-value">--</div>
              <div className="growth-label">Retention Rate</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MRFGDashboard;