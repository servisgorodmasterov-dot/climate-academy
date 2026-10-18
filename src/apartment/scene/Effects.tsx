import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing';

export default function Effects() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
          <N8AO aoRadius={0.5} intensity={1.6} distanceFalloff={0.8} quality="medium" halfRes />
          <Bloom luminanceThreshold={1.05} intensity={0.25} mipmapBlur />
          <Vignette eskil={false} offset={0.25} darkness={0.35} />
          <SMAA />
        </EffectComposer>
  );
}
