import Icon from './Icon';
import { getFocusInsights } from '../lib/focusSession';

export default function FocusInsights({ history, now }) {
  const insights = getFocusInsights(history, now);
  const dailyGoal = 60;
  const goalPercent = Math.min(100, Math.round(insights.todayMinutes / dailyGoal * 100));
  const maxMinutes = Math.max(60, ...insights.week.map((day) => day.minutes));
  const recent = history.slice(0, 5);

  return (
    <section className="activity-section" id="activity" aria-labelledby="activity-title">
      <div className="section-heading"><div><p className="eyebrow">SMALL STEPS, STEADY PROGRESS</p><h2 id="activity-title">Your activity</h2></div>
        <span className="section-note">Completed focus sessions</span></div>
      <div className="stat-grid">
        <div className="panel stat-card"><span className="stat-icon lavender"><Icon name="clock" /></span><div><p>Focus today</p><strong>{insights.todayMinutes}<span> min</span></strong></div></div>
        <div className="panel stat-card"><span className="stat-icon mint"><Icon name="check" /></span><div><p>Sessions today</p><strong>{insights.todaySessions}<span> completed</span></strong></div></div>
        <div className="panel stat-card"><span className="stat-icon peach"><Icon name="chart" /></span><div><p>Last 7 days</p><strong>{insights.weekMinutes}<span> min</span></strong></div></div>
      </div>
      <div className="insight-grid">
        <section className="panel week-panel" aria-labelledby="week-title">
          <div className="panel-heading"><div><h3 id="week-title">A week of focus</h3><p className="supporting-text">Every session adds up.</p></div><span className="quiet-badge">Last 7 days</span></div>
          <div className="week-chart" role="list" aria-label="Focus minutes by day">
            {insights.week.map((day) => <div className="chart-day" key={day.key} role="listitem" aria-label={`${day.key}: ${day.minutes} focus minutes`}>
              <span className="chart-value">{day.minutes}</span>
              <div className="chart-column"><span className={`chart-bar${day.key === insights.week[6].key ? ' today' : ''}`} style={{ height: `${day.minutes / maxMinutes * 100}%` }} /></div>
              <span className="chart-label">{day.label}</span>
            </div>)}
          </div>
          <div className="daily-goal"><div><span>Daily goal</span><strong>{insights.todayMinutes} / {dailyGoal} min</strong></div>
            <progress value={Math.min(insights.todayMinutes, dailyGoal)} max={dailyGoal} aria-label="Daily focus goal" />
            <p>{goalPercent === 100 ? 'Goal reached. Give yourself a little credit.' : `${goalPercent}% of your daily goal`}</p>
          </div>
        </section>
        <section className="panel history-panel" aria-labelledby="history-title">
          <div className="panel-heading"><div><h3 id="history-title">Recent sessions</h3><p className="supporting-text">Your latest moments of momentum.</p></div></div>
          {recent.length ? <ul className="session-history">{recent.map((record) => <li key={record.id}>
            <span className="history-check"><Icon name="check" size={17} /></span>
            <div><strong>{record.minutes}-minute focus</strong><span>{new Date(record.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
            <span className="history-duration">+{record.minutes} min</span>
          </li>)}</ul> : <div className="empty-history"><span className="empty-icon"><Icon name="clock" size={27} /></span><h4>Your first session starts here</h4><p>Finish a focus session to see your progress. One small step is a great start.</p><a href="#focus-session">Make time for focus <Icon name="arrow" size={17} /></a></div>}
          <p className="panel-footnote">Your latest 500 completed focus sessions are kept on this browser.</p>
        </section>
      </div>
    </section>
  );
}
