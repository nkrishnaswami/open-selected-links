import {SettingSpecs, LoadSettings, SaveSettings} from './settings.js';


const optionsForm = document.getElementById('options');
const settings = await LoadSettings()

const table = document.createElement('table');
optionsForm.appendChild(table)
for (const spec of SettingSpecs) {
  const tr = document.createElement('tr');
  table.appendChild(tr);
  const td_label = document.createElement('td');
  tr.appendChild(td_label);
  const label = document.createElement('label');
  td_label.appendChild(label);
  label['for'] = spec.name;
  label.innerText = spec.description;
  const td_input = document.createElement('td');
  tr.appendChild(td_input);
  const input = document.createElement('input');
  td_input.appendChild(input);
  input.id = spec.name;
  input.type = spec.input_type;
  if (spec.input_type == 'checkbox') {
    input.checked = settings[spec.name];
    input.addEventListener('change', async event => {
      console.log(`option: ${event.target.id} => ${event.target.checked}`)
      settings[spec.name] = input.checked
      await SaveSettings(settings);
    })
  } else {
    input.value = settings[spec.name];
    input.addEventListener('change', async event => {
      console.log(`option: ${event.target.id} => ${event.target.value}`)
      settings[spec.name] = input.value
      await SaveSettings(settings);
    })
  }
}
