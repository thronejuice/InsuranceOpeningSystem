import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

export interface AgentDashboard {
  myJobs: number;
  openJobs: number;
  waitingInfo: number;
  quotationJobs: number;
  waitingCustomer: number;
  bindingJobs: number;
  policyIssued: number;
  renewalJobs: number;
  overdueTasks: number;
}

export interface ManagerDashboard {
  totalJobs: number;
  jobsByStatus: Record<string, number>;
  jobsByAgent: { agentId: string; count: number }[];
  totalPremium: string;
  totalCommission: string;
  policyCount: number;
  conversionRate: string;
  overdueCount: number;
}

export interface FunnelData {
  stages: {
    job: number;
    quotation: number;
    proposal: number;
    accepted: number;
    policy: number;
  };
  metrics: {
    quotationConversion: string;
    proposalConversion: string;
    policyConversion: string;
    totalPremium: string;
    averagePremium: string;
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  agentDashboard(): Observable<AgentDashboard> {
    return this.http.get<{ success: boolean; data: AgentDashboard }>('/api/dashboard/agent').pipe(map((r) => r.data));
  }

  managerDashboard(): Observable<ManagerDashboard> {
    return this.http.get<{ success: boolean; data: ManagerDashboard }>('/api/dashboard/manager').pipe(map((r) => r.data));
  }

  funnel(): Observable<FunnelData> {
    return this.http.get<{ success: boolean; data: FunnelData }>('/api/dashboard/funnel').pipe(map((r) => r.data));
  }
}
