import { Settings, settingSpecs, loadSettings, saveSettings, setBoolean, setString } from '../common/settings'

const optionsForm = document.getElementById('options')!
const settings: Settings = await loadSettings();

const table = document.createElement('table');
optionsForm.appendChild(table);
for (const spec of settingSpecs) {
  const tr = document.createElement('tr');
  table.appendChild(tr);
  const td_label = document.createElement('td');
  tr.appendChild(td_label);
  const label = document.createElement('label');
  td_label.appendChild(label);
  label.htmlFor = spec.name;
  label.innerText = spec.description;
  const td_input = document.createElement('td');
  tr.appendChild(td_input);
  const input = document.createElement('input');
  td_input.appendChild(input);
  input.id = spec.name;
  input.type = spec.input_type;
  if (spec.input_type == 'checkbox') {
    input.checked = settings[spec.name] as boolean;
    input.addEventListener('change', async (event) => {
      const target = event.target! as HTMLInputElement;
      console.log(`option: ${target.id!} => ${target.checked}`);
      setBoolean(settings, spec.name, input.checked);
      await saveSettings(settings);
    })
  } else {
    input.value = settings[spec.name] as string;
    input.addEventListener('change', async (event) => {
      const target = event.target! as HTMLInputElement;
      console.log(`option: ${target.id} => ${target.value}`);
      setString(settings, spec.name, input.value as string);
      await saveSettings(settings);
    })
  }
}
