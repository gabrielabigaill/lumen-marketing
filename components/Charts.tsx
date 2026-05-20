'use client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend, LineChart, Line } from 'recharts';

const stroke = 'rgb(91 91 246)';
const stroke2 = 'rgb(236 72 153)';

export function EngagementArea({ data }: { data: Array<{ date: string; engagement_rate: number | null; followers: number | null }> }) {
  return (
    <div className="dashboard-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="erFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={stroke} stopOpacity={0.4} />
              <stop offset="95%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(230 232 239 / .6)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgb(148 163 184)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'rgb(148 163 184)' }} />
          <Tooltip />
          <Area type="monotone" dataKey="engagement_rate" stroke={stroke} fill="url(#erFill)" strokeWidth={2.5} name="ER %" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FollowersLine({ data }: { data: Array<{ date: string; followers: number | null }> }) {
  return (
    <div className="dashboard-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(230 232 239 / .6)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgb(148 163 184)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'rgb(148 163 184)' }} />
          <Tooltip />
          <Line type="monotone" dataKey="followers" stroke={stroke2} strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ContentTypeBar({ data }: { data: Array<{ type: string; engagement_rate: number }> }) {
  return (
    <div className="dashboard-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(230 232 239 / .6)" />
          <XAxis dataKey="type" tick={{ fontSize: 11, fill: 'rgb(148 163 184)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'rgb(148 163 184)' }} />
          <Tooltip />
          <Bar dataKey="engagement_rate" radius={[8,8,0,0]} fill={stroke} name="ER %" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
