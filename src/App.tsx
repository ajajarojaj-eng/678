import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainMenu from './pages/MainMenu';
import MedievalKingdoms from './games/MedievalKingdoms';
import CastleSiege from './games/CastleSiege';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/game1" element={<MedievalKingdoms />} />
        <Route path="/game2" element={<CastleSiege />} />
      </Routes>
    </BrowserRouter>
  );
}
