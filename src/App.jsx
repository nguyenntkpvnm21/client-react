import { useState, useEffect } from 'react';
import './App.css';
import SoundMixer from './components/SoundMixer';

// Các giai đoạn dùng ảnh tự cung cấp trong thư mục public/
const TREE_STAGES = [
  { minWater: 0, stage: 'Sleeping Seedling', img: '/tree-stage1.jpg' },
  { minWater: 3, stage: 'Growing Sprout', img: '/tree-stage2.jpg' },
  { minWater: 6, stage: 'Blooming Flower', img: '/tree-stage3.jpg' },
  { minWater: 10, stage: 'Majestic Ancient Tree!', img: '/tree-stage4.jpg' }
];

function App() {
  const [gardenData, setGardenData] = useState(null);
  const [waterCount, setWaterCount] = useState(0);

  useEffect(() => {
    fetch('https://server-api-1-4i16.onrender.com/')
      .then((res) => res.json())
      .then((data) => setGardenData(data))
      .catch((err) => console.error('Error fetching data:', err));
  }, []);

  const currentTree = [...TREE_STAGES].reverse().find(t => waterCount >= t.minWater) || TREE_STAGES[0];

  return (
    <div className="garden-overlay">
      <div className="garden-app">
        {/* Header */}
        <header className="clean-card garden-header">
          <h1>{gardenData ? gardenData.gardenName : 'Planting the seeds...'}</h1>
          <p className="quote">{gardenData?.dailyQuote}</p>
          <span className="server-badge">{gardenData?.serverStatus || 'Connecting to cloud server...'}</span>
        </header>

        <SoundMixer />

        {/* Cây chính tương tác */}
        <section className="clean-card plant-care-zone">
          <h2>Grow Your Tree Together 🌿</h2>
          <div className="tree-avatar-box">
            <img src={currentTree.img} alt="Tree Stage" className="tree-avatar" />
          </div>
          <p className="stage-name">{currentTree.stage}</p>
          <p className="water-stats">Watered: <strong>{waterCount}</strong> drops 💧</p>

          <div className="action-btns">
            <button className="water-btn" onClick={() => setWaterCount(waterCount + 1)}>
              💧 Water Me
            </button>
            {waterCount > 0 && (
              <button className="reset-btn" onClick={() => setWaterCount(0)}>
                Plant a New Seed 🌱
              </button>
            )}
          </div>
        </section>

        {/* Danh sách người bạn */}
        <section className="friends-zone">
          <h3 className="section-title">Meet the Garden Friends</h3>
          <div className="plant-grid">
            {gardenData?.plants?.map((plant, index) => (
              <div key={index} className="clean-card plant-card">
                <img src={plant.image} alt={plant.name} className="card-plant-img" />
                <h4>{plant.name}</h4>
                <span className="plant-role">{plant.role}</span>
                <p>{plant.bio}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;