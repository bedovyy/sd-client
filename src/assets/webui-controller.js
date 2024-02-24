import AController from '@/assets/acontroller';
import axios from 'axios';
import { getBase64FileExtension } from './utils';

export default class WebUIController extends AController {
  // image format and quality
  imageFormat;
  imageQuality;

  // progress timeout
  timeout = null;

  static async checkUrl(url) {
    try {
      const res = await axios.get(`${url}/sdapi/v1/progress?skip_current_image=true`, { timeout: 3000 });
      if (res.status == 200 && res.data["progress"] != null) {
        return true;
      }
    } catch (e) {
      console.log(e);
    }
    return false;
  }
  getCheckpoints() { return this.checkpoints; }
  getVAEs() { return this.vaes; }
  getSamplers() { return this.samplers; }
  getSchedulers() { }

  setImageFormat(imageFormat, imageQuality) {
    this.imageFormat = imageFormat;
    this.imageQuality = imageQuality;
    axios.post(`${this.url}/sdapi/v1/options`, { samples_format: imageFormat, jpeg_quality: imageQuality, webp_lossless: false });
  }
  getImageFormat() {
    return [this.imageFormat, this.imageQuality];
  }

  async prepare() {
    console.log(this);
    this.checkpoints = (await axios.get(`${this.url}/sdapi/v1/sd-models`)).data.filter(v => v != "").map(v => v.title.replace(/\[[^\]]*\]$/, "").trim());
    this.vaes = (await axios.get(`${this.url}/sdapi/v1/sd-vae`)).data.map(v => v.model_name);
    this.samplers = (await axios.get(`${this.url}/sdapi/v1/samplers`)).data.map(v => v.name);

    const options = (await axios.get(`${this.url}/sdapi/v1/options`)).data;
    this.imageFormat = options.samples_format;
    this.imageQuality = options.jpeg_quality;
  }

  checkProgress(force = false) {
    //TODO: fix timing issue.
    if (force || this.timeout) {
      axios.get(`${this.url}/sdapi/v1/progress?skip_current_image=true`).then(res => {
        this.listener("running", "PROCESSING" + (res.data.state?.sampling_step ? `: ${res.data.state.sampling_step} / ${res.data.state.sampling_steps}` : ""), Math.floor(res.data.progress * 100));
      });
    }
    this.timeout = setTimeout(() => this.checkProgress(), 500);
  }

  async generate(info) {
    const params = Object.assign({}, info);
    delete params.checkpoint;
    delete params.vae;
    params.save_images = true;

    // change checkpoint and vae model.
    this.listener("running", "LOADING MODELS");
    // it seems changing checkpoint and vae together make problem.
    await axios.post(`${this.url}/sdapi/v1/options`, { sd_model_checkpoint: info.checkpoint });
    await axios.post(`${this.url}/sdapi/v1/options`, { sd_vae: info.vae || "None" });


    this.checkProgress(true);
    try {
      const res = await axios.post(`${this.url}/sdapi/v1/txt2img`, params);
      clearTimeout(this.timeout);
      this.timeout = null;
      res.data.images.forEach(base64 => this.listener("done", `data:image/${getBase64FileExtension(base64)};base64,${base64}`, info));
    } catch (e) {
      this.listener("error", e);
    }
  }
}