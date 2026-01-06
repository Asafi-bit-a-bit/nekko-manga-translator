// Progress bar component
export const ProgressBar = ({ current, total, label }) => {
  if (total === 0) return null
  return (
    <div className="progress-bar-container">
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
      <span className="progress-text">{current} / {total} {label}</span>
    </div>
  )
}

