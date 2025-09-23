import React, { useState, useEffect } from 'react';
import { 
  User, 
  MapPin, 
  Calendar, 
  FileText, 
  AlertCircle, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Building2,
  X,
  Shield,
  Award,
  TrendingUp,
  DollarSign
} from 'lucide-react';
import type { EnhancedProducerProfile } from '../lib/types';
import { getCarrierName, buildCarrierLookupCache, buildCarrierLookupFromAppointmentData } from '../lib/api';
import './ProducerDetailPanel.css';

interface ProducerDetailPanelProps {
  profile: EnhancedProducerProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: (producerId: number) => void;
  fetchAuth: () => string;
}

const ProducerDetailPanel: React.FC<ProducerDetailPanelProps> = ({
  profile,
  isOpen,
  onClose,
  onRefresh,
  fetchAuth
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'licenses' | 'appointments' | 'contracts' | 'addresses'>('overview');
  const [carrierNames, setCarrierNames] = useState<Map<number, string>>(new Map());
  const [carrierLookupLoading, setCarrierLookupLoading] = useState(false);
  
  // Debug logging
  React.useEffect(() => {
    if (profile && isOpen) {
      console.log('🔍 Producer Detail Panel Data Debug:', {
        profileId: profile.basic.id,
        profileName: profile.basic.name,
        licensesCount: profile.licenses.length,
        appointmentsCount: profile.appointments.length,
        contractsCount: profile.contracts.length,
        addressesCount: profile.addresses.length,
        complianceStatus: profile.complianceStatus,
        sampleLicense: profile.licenses[0] || null,
        sampleAppointment: profile.appointments[0] || null
      });
    }
  }, [profile, isOpen]);

  // Function to resolve carrier names for appointments and contracts
  const resolveCarrierNames = async () => {
    if (!profile || carrierLookupLoading) return;
    
    console.log(`🔍 DEBUG: Starting carrier name resolution for producer ${profile.basic.id}`);
    console.log(`🔍 DEBUG: Profile appointments:`, profile.appointments);
    console.log(`🔍 DEBUG: Profile contracts:`, profile.contracts);
    
    setCarrierLookupLoading(true);
    try {
      // Extract unique carrier IDs from appointments and contracts
      const carrierIds = new Set<number>();
      
      // Get carrier IDs from appointments
      profile.appointments.forEach(appointment => {
        const carrierId = getFieldValue(appointment, ['carrierId', 'carrier_id', 'id', 'carrier']);
        if (carrierId && typeof carrierId === 'number') {
          carrierIds.add(carrierId);
        }
      });
      
      // Get carrier IDs from contracts
      profile.contracts.forEach(contract => {
        const carrierId = getFieldValue(contract, ['carrierId', 'carrier_id', 'id', 'carrier']);
        if (carrierId && typeof carrierId === 'number') {
          carrierIds.add(carrierId);
        }
      });
      
      console.log(`🔍 DEBUG: Found carrier IDs:`, Array.from(carrierIds));
      
      if (carrierIds.size === 0) {
        console.log(`📊 No carrier IDs found in appointment/contract data`);
        setCarrierNames(new Map());
        setCarrierLookupLoading(false);
        return;
      }
      
      // Get auth token from parent component
      const token = fetchAuth();
      
      // Build carrier lookup cache (this will try multiple methods)
      await buildCarrierLookupCache(token);
      
      // Resolve carrier names using the cache
      const newCarrierNames = new Map<number, string>();
      for (const carrierId of carrierIds) {
        const carrierName = await getCarrierName(carrierId, token);
        if (carrierName) {
          newCarrierNames.set(carrierId, carrierName);
        }
      }
      
      setCarrierNames(newCarrierNames);
      console.log(`✅ Resolved ${newCarrierNames.size} carrier names from API`);
      
      if (newCarrierNames.size === 0) {
        console.warn('⚠️ No carrier names were resolved. This might be due to API permissions or data availability.');
      }
    } catch (error) {
      console.error('❌ Error resolving carrier names:', error);
      // Set empty map to indicate lookup failed
      setCarrierNames(new Map());
    } finally {
      setCarrierLookupLoading(false);
    }
  };

  useEffect(() => {
    // Reset to overview tab when profile changes
    if (profile) {
      setActiveTab('overview');
      // Resolve carrier names when profile changes
      resolveCarrierNames();
    }
  }, [profile?.basic.id]);

  if (!isOpen || !profile) {
    return null;
  }

  const { basic, relationship, appointments, licenses, addresses, contracts, complianceStatus } = profile;

  const getComplianceIcon = (status: string) => {
    switch (status) {
      case 'compliant': return <CheckCircle size={16} className="text-green-500" />;
      case 'expiring': return <Clock size={16} className="text-yellow-500" />;
      case 'expired': return <AlertCircle size={16} className="text-red-500" />;
      default: return <AlertTriangle size={16} className="text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium';
    switch (status.toLowerCase()) {
      case 'active': return `${baseClasses} bg-green-100 text-green-800`;
      case 'compliant': return `${baseClasses} bg-green-100 text-green-800`;
      case 'pending': return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'expiring': return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'expired': return `${baseClasses} bg-red-100 text-red-800`;
      case 'terminated': return `${baseClasses} bg-red-100 text-red-800`;
      case 'inactive': return `${baseClasses} bg-gray-100 text-gray-800`;
      default: return `${baseClasses} bg-gray-100 text-gray-600`;
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const getDaysUntilExpiration = (expirationDate: string | undefined) => {
    if (!expirationDate) return null;
    try {
      const expDate = new Date(expirationDate);
      const now = new Date();
      const diffTime = expDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  };

  const renderOverviewTab = () => (
    <div className="overview-tab">
      {/* Producer Header */}
      <div className="producer-header">
        <div className="producer-avatar">
          <User size={32} />
        </div>
        <div className="producer-info">
          <h2 className="producer-name">{basic.name}</h2>
          <p className="producer-meta">
            {basic.npn && `NPN: ${basic.npn}`}
            {relationship?.branchCode && ` • ${relationship.branchCode}`}
          </p>
          <div className="producer-badges">
            <span className={getStatusBadge(relationship?.status || 'unknown')}>
              {relationship?.status || 'Unknown'}
            </span>
            {relationship?.upline && (
              <span className="upline-badge">
                Reports to: {relationship.upline}
              </span>
            )}
          </div>
        </div>
        <div className="producer-actions">
          <button
            onClick={() => onRefresh?.(basic.id)}
            className="refresh-btn"
            title="Refresh producer data"
          >
            <TrendingUp size={16} />
          </button>
        </div>
      </div>

      {/* Compliance Overview */}
      <div className="compliance-overview">
        <h3 className="section-title">
          <Shield size={16} />
          Compliance Status
        </h3>
        <div className="compliance-grid">
          <div className="compliance-item">
            <div className="compliance-header">
              {getComplianceIcon(complianceStatus.licenseCompliance)}
              <span className="compliance-label">License Compliance</span>
            </div>
            <span className={getStatusBadge(complianceStatus.licenseCompliance)}>
              {complianceStatus.licenseCompliance.charAt(0).toUpperCase() + 
               complianceStatus.licenseCompliance.slice(1)}
            </span>
          </div>
          <div className="compliance-item">
            <div className="compliance-header">
              {getComplianceIcon(complianceStatus.appointmentStatus)}
              <span className="compliance-label">Appointment Status</span>
            </div>
            <span className={getStatusBadge(complianceStatus.appointmentStatus)}>
              {complianceStatus.appointmentStatus.charAt(0).toUpperCase() + 
               complianceStatus.appointmentStatus.slice(1)}
            </span>
          </div>
        </div>
        
        {(complianceStatus.hasErrors || complianceStatus.hasWarnings) && (
          <div className="compliance-alerts">
            {complianceStatus.hasErrors && (
              <div className="alert alert-error">
                <AlertCircle size={16} />
                <span>Has active errors requiring attention</span>
              </div>
            )}
            {complianceStatus.hasWarnings && (
              <div className="alert alert-warning">
                <AlertTriangle size={16} />
                <span>Has warnings to review</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="quick-stats">
        <div className="stat-card">
          <div className="stat-icon">
            <Award size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-number">{licenses.length}</div>
            <div className="stat-label">Licenses</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <Building2 size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-number">{appointments.length}</div>
            <div className="stat-label">Appointments</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <FileText size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-number">{contracts.length}</div>
            <div className="stat-label">Contracts</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <MapPin size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-number">{addresses.length}</div>
            <div className="stat-label">Addresses</div>
          </div>
        </div>
      </div>

      {/* Recent Activity - Placeholder */}
      <div className="recent-activity">
        <h3 className="section-title">
          <TrendingUp size={16} />
          Recent Activity
        </h3>
        <div className="activity-list">
          <div className="activity-item">
            <div className="activity-icon">
              <Calendar size={14} />
            </div>
            <div className="activity-content">
              <span className="activity-text">Profile last updated</span>
              <span className="activity-date">{formatDate(profile.lastUpdated)}</span>
            </div>
          </div>
          {relationship?.ts && (
            <div className="activity-item">
              <div className="activity-icon">
                <FileText size={14} />
              </div>
              <div className="activity-content">
                <span className="activity-text">Relationship updated</span>
                <span className="activity-date">{formatDate(relationship.ts)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Helper function to safely extract field values with multiple possible field names
  const getFieldValue = (obj: any, fieldNames: string[]): any => {
    for (const fieldName of fieldNames) {
      if (obj && obj[fieldName] !== undefined && obj[fieldName] !== null) {
        return obj[fieldName];
      }
    }
    return null;
  };

  const renderLicensesTab = () => (
    <div className="licenses-tab">
      <div className="tab-header">
        <h3>Licenses ({licenses.length})</h3>
      </div>
      {licenses.length === 0 ? (
        <div className="empty-state">
          <Award size={32} />
          <p>No license information available</p>
        </div>
      ) : (
        <div className="licenses-list">
          {licenses.map((license, index) => {
            // Try multiple possible field names for each property
            const licenseType = getFieldValue(license, ['type', 'licenseType', 'product', 'productType', 'lineOfAuthority', 'authority']);
            const licenseNumber = getFieldValue(license, ['licenseNumber', 'number', 'id', 'licenseId']);
            const issuedDate = getFieldValue(license, ['issuedDate', 'issueDate', 'dateIssued', 'effectiveDate', 'startDate']);
            const expirationDate = getFieldValue(license, ['expirationDate', 'expireDate', 'dateExpires', 'endDate', 'expiryDate']);
            const state = getFieldValue(license, ['state', 'stateCode', 'jurisdiction', 'location']);
            const status = getFieldValue(license, ['status', 'licenseStatus', 'state']) || 'Unknown';
            const isResident = getFieldValue(license, ['residentState', 'resident', 'isResident']);
            
            const daysUntilExpiration = getDaysUntilExpiration(expirationDate);
            
            return (
              <div key={license.id || index} className="license-card">
                <div className="license-header">
                  <div className="license-info">
                    <h4 className="license-type">{licenseType || state || 'License'}</h4>
                    <p className="license-number">{licenseNumber || 'N/A'}</p>
                  </div>
                  <span className={getStatusBadge(status)}>
                    {status}
                  </span>
                </div>
                <div className="license-details">
                  <div className="license-detail-item">
                    <MapPin size={14} />
                    <span>{state || 'N/A'} {isResident ? '(Resident)' : '(Non-Resident)'}</span>
                  </div>
                  <div className="license-detail-item">
                    <Calendar size={14} />
                    <span>Issued: {formatDate(issuedDate)}</span>
                  </div>
                  <div className="license-detail-item">
                    <Calendar size={14} />
                    <span>Expires: {formatDate(expirationDate)}</span>
                    {daysUntilExpiration !== null && daysUntilExpiration <= 60 && (
                      <span className={`expiration-warning ${daysUntilExpiration <= 30 ? 'urgent' : 'soon'}`}>
                        ({daysUntilExpiration > 0 ? `${daysUntilExpiration} days left` : 'Expired'})
                      </span>
                    )}
                  </div>
                  {license.lineOfAuthority && license.lineOfAuthority.length > 0 && (
                    <div className="license-detail-item">
                      <Shield size={14} />
                      <span>LOA: {license.lineOfAuthority.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderAppointmentsTab = () => (
    <div className="appointments-tab">
      <div className="tab-header">
        <h3>Appointments ({appointments.length})</h3>
      </div>
      {appointments.length === 0 ? (
        <div className="empty-state">
          <Building2 size={32} />
          <p>No appointment information available</p>
        </div>
      ) : (
        <div className="appointments-list">
          {appointments.map((appointment, index) => {
            // Try multiple possible field names for each property
            let carrierName = getFieldValue(appointment, ['carrierName', 'carrier', 'companyName', 'company', 'name']);
            const carrierId = getFieldValue(appointment, ['carrierId', 'carrier_id', 'id', 'carrier']);
            
            // If no carrier name found, try to resolve from carrier ID using our lookup cache
            if (!carrierName && carrierId && typeof carrierId === 'number') {
              carrierName = carrierNames.get(carrierId) || null;
            }
            
            const agentNumber = getFieldValue(appointment, ['agentNumber', 'agentId', 'number', 'id', 'appointmentId']);
            const appointmentDate = getFieldValue(appointment, ['appointmentDate', 'dateAppointed', 'effectiveDate', 'startDate', 'appointedDate']);
            const terminationDate = getFieldValue(appointment, ['terminationDate', 'dateTerminated', 'endDate', 'terminatedDate']);
            const state = getFieldValue(appointment, ['state', 'stateCode', 'jurisdiction', 'location']);
            const status = getFieldValue(appointment, ['status', 'appointmentStatus', 'state']) || 'Unknown';
            const lineOfAuthority = getFieldValue(appointment, ['lineOfAuthority', 'loa', 'authority', 'authorities']);
            
            return (
              <div key={appointment.id || index} className="appointment-card">
                <div className="appointment-header">
                  <div className="appointment-info">
                    <h4 className="carrier-name">
                      {carrierName || (carrierLookupLoading ? 'Loading...' : (carrierNames.size === 0 ? 'Carrier Lookup Unavailable' : 'Unknown Carrier'))}
                    </h4>
                    <p className="appointment-details">
                      {state || 'N/A'} {agentNumber && `• Agent #${agentNumber}`}
                    </p>
                  </div>
                  <span className={getStatusBadge(status)}>
                    {status}
                  </span>
                </div>
                <div className="appointment-details">
                  <div className="appointment-detail-item">
                    <Calendar size={14} />
                    <span>Appointed: {formatDate(appointmentDate)}</span>
                  </div>
                  {terminationDate && (
                    <div className="appointment-detail-item">
                      <Calendar size={14} />
                      <span>Terminated: {formatDate(terminationDate)}</span>
                    </div>
                  )}
                {lineOfAuthority && (
                  <div className="appointment-detail-item">
                    <Shield size={14} />
                    <span>LOA: {Array.isArray(lineOfAuthority) ? lineOfAuthority.join(', ') : lineOfAuthority}</span>
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderContractsTab = () => (
    <div className="contracts-tab">
      <div className="tab-header">
        <h3>Contracts ({contracts.length})</h3>
      </div>
      {contracts.length === 0 ? (
        <div className="empty-state">
          <DollarSign size={32} />
          <p>No contract information available</p>
          <div style={{fontSize: '12px', color: '#9ca3af', marginTop: '8px'}}>
            This could mean: API returned no contracts, API endpoint error, or MRFG doesn't have contracts
          </div>
        </div>
      ) : (
        <div className="contracts-list">
          {contracts.map((contract, index) => {
            // Try multiple possible field names for each property
            let carrierName = getFieldValue(contract, ['carrierName', 'carrier', 'companyName', 'company', 'name']);
            const carrierId = getFieldValue(contract, ['carrierId', 'carrier_id', 'id', 'carrier']);
            
            // If no carrier name found, try to resolve from carrier ID using our lookup cache
            if (!carrierName && carrierId && typeof carrierId === 'number') {
              carrierName = carrierNames.get(carrierId) || null;
            }
            
            const contractNumber = getFieldValue(contract, ['contractNumber', 'number', 'id', 'contractId', 'reference']);
            const effectiveDate = getFieldValue(contract, ['effectiveDate', 'startDate', 'dateEffective', 'beginDate']);
            const terminationDate = getFieldValue(contract, ['terminationDate', 'endDate', 'dateTerminated', 'expirationDate']);
            const contractType = getFieldValue(contract, ['contractType', 'type', 'category', 'kind']);
            const status = getFieldValue(contract, ['status', 'contractStatus', 'state']) || 'Unknown';
            
            return (
              <div key={contract.id || index} className="contract-card">
                <div className="contract-header">
                  <div className="contract-info">
                    <h4 className="carrier-name">
                      {carrierName || (carrierLookupLoading ? 'Loading...' : (carrierNames.size === 0 ? 'Carrier Lookup Unavailable' : 'Unknown Carrier'))}
                    </h4>
                    <p className="contract-number">{contractNumber ? `Contract #${contractNumber}` : 'N/A'}</p>
                  </div>
                  <span className={getStatusBadge(status)}>
                    {status}
                  </span>
                </div>
                <div className="contract-details">
                  <div className="contract-detail-item">
                    <Calendar size={14} />
                    <span>Effective: {formatDate(effectiveDate)}</span>
                  </div>
                  {terminationDate && (
                    <div className="contract-detail-item">
                      <Calendar size={14} />
                      <span>Terminated: {formatDate(terminationDate)}</span>
                    </div>
                  )}
                  {contractType && (
                    <div className="contract-detail-item">
                      <FileText size={14} />
                      <span>Type: {contractType}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderAddressesTab = () => (
    <div className="addresses-tab">
      <div className="tab-header">
        <h3>Addresses ({addresses.length})</h3>
      </div>
      {addresses.length === 0 ? (
        <div className="empty-state">
          <MapPin size={32} />
          <p>No address information available</p>
        </div>
      ) : (
        <div className="addresses-list">
          {addresses.map((address, index) => (
            <div key={address.id || index} className="address-card">
              <div className="address-header">
                <div className="address-type">
                  <MapPin size={16} />
                  <span className="address-type-label">
                    {address.type.charAt(0).toUpperCase() + address.type.slice(1)} Address
                  </span>
                  {address.isPrimary && (
                    <span className="primary-badge">Primary</span>
                  )}
                </div>
              </div>
              <div className="address-details">
                <p className="address-line">{address.address1}</p>
                {address.address2 && <p className="address-line">{address.address2}</p>}
                <p className="address-line">
                  {address.city}, {address.state} {address.zipCode}
                </p>
                {address.country && address.country !== 'US' && (
                  <p className="address-line">{address.country}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="producer-detail-panel-overlay">
      <div className="producer-detail-panel">
        <div className="panel-header">
          <div className="panel-title">
            <User size={20} />
            <span>Producer Details</span>
          </div>
          <button onClick={onClose} className="close-button">
            <X size={20} />
          </button>
        </div>

        <div className="panel-tabs">
          {(['overview', 'licenses', 'appointments', 'contracts', 'addresses'] as const).map(tab => (
            <button
              key={tab}
              className={`tab-button ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="panel-content">
          {activeTab === 'overview' && renderOverviewTab()}
          {activeTab === 'licenses' && renderLicensesTab()}
          {activeTab === 'appointments' && renderAppointmentsTab()}
          {activeTab === 'contracts' && renderContractsTab()}
          {activeTab === 'addresses' && renderAddressesTab()}
        </div>
      </div>
    </div>
  );
};

export default ProducerDetailPanel;