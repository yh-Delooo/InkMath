import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
AppRegistry.registerComponent(name, () => App);
PluginManager.init();
const icon = Image.resolveAssetSource(require('./assets/math.png')).uri;
PluginManager.registerButton(1, ['NOTE'], {id: 100, name: 'InkMath', icon, showType: 1});
PluginManager.registerButton(2, ['NOTE'], {id: 200, name: '渲染公式', icon, editDataTypes: [0], showType: 1});


PluginManager.registerButton(2, ['NOTE'], {id: 201, name: '一键绘图', icon, editDataTypes: [2], showType: 1});
