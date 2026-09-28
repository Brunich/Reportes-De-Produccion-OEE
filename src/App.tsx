import Shell from './Shell';
import { info } from './info';
import Planta from './Planta';

export default function App() {
 return <Shell info={info} repo="planta-oee" page="planta">{lang => <Planta lang={lang}/>}</Shell>;
}
