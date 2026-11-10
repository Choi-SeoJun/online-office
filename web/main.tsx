import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import OfficeEntry from '../components/office-entry';

createRoot(document.getElementById('root')!).render(<OfficeEntry />);
