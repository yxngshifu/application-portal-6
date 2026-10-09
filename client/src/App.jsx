import { Route, Routes } from 'react-router-dom';
import Edit from './pages/Edit.jsx';
import Landing from './pages/Landing.jsx';
import Shell from './components/Shell.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/application/:id" element={<Edit />} />
      <Route path="*" element={<Shell><p className="py-24 text-center text-muted">Page not found.</p></Shell>} />
    </Routes>
  );
}
